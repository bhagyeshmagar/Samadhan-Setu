"""
Integration tests for Samadhan Setu — Phase 0.1 Security Containment.

Run:
    cd backend
    python -m pytest tests/test_security.py -v
"""
import io
import pytest
from unittest.mock import MagicMock, patch
from starlette.testclient import TestClient

from app.main import app
from app.database import get_db
from app.models.user import User, UserRole
from app.models.complaint import Complaint, ComplaintStatus, ComplaintPriority


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _make_user(uid="user-001", email="citizen@test.in", name="Test Citizen",
               role=UserRole.CITIZEN, department_id=None):
    u = User(email=email, password_hash="x", name=name, role=role,
             department_id=department_id)
    u.id = uid
    return u


def _make_officer(uid="off-001", department_id="dept-water"):
    return _make_user(uid=uid, email="officer@test.in", name="Officer A",
                      role=UserRole.OFFICER, department_id=department_id)


def _make_complaint(complaint_id="comp-001", user_id="user-001", department_id="dept-water"):
    c = Complaint(user_id=user_id, title="Test pothole", category="Road",
                  description="Big pothole near station", location="Ward 5",
                  priority=ComplaintPriority.MEDIUM, status=ComplaintStatus.SUBMITTED)
    c.id = complaint_id
    c.department_id = department_id
    c.attachments = []
    return c


def _valid_jpeg_bytes():
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (2, 2), color=(255, 0, 0)).save(buf, format="JPEG")
    return buf.getvalue()


def _fake_db(user=None, complaint=None, team_dept="dept-water"):
    """Minimal Firestore mock."""
    db = MagicMock()

    # users by doc id
    user_doc = MagicMock()
    user_doc.exists = user is not None
    user_doc.id = user.id if user else "u0"
    if user:
        fd = user.to_firestore()
        fd["id"] = user.id
        user_doc.to_dict = MagicMock(return_value=fd)
    else:
        user_doc.to_dict = MagicMock(return_value={})

    # allow any document(id) lookup to resolve the user
    db.collection.return_value.document.return_value.get.return_value = user_doc
    db.collection.return_value.document.return_value.set = MagicMock()
    db.collection.return_value.document.return_value.update = MagicMock()

    # users by email (where query)
    db.collection.return_value.where.return_value.limit.return_value.get.return_value = \
        [user_doc] if user else []

    # complaints
    comp_doc = MagicMock()
    comp_doc.exists = complaint is not None
    comp_doc.id = complaint.id if complaint else "c0"
    if complaint:
        cfd = complaint.to_firestore()
        cfd["id"] = complaint.id
        comp_doc.to_dict = MagicMock(return_value=cfd)
    else:
        comp_doc.to_dict = MagicMock(return_value={})

    def _doc_selector(doc_id=None):
        ref = MagicMock()
        ref.set = MagicMock()
        ref.update = MagicMock()
        if complaint and doc_id == complaint.id:
            ref.get.return_value = comp_doc
            ref.id = complaint.id
        else:
            ref.get.return_value = user_doc
            ref.id = doc_id or "new-001"
        return ref

    # Return a new fake ref for each collection().document() call
    db.collection.return_value.document.side_effect = _doc_selector
    db.collection.return_value.add = MagicMock()

    # teams
    team_doc = MagicMock()
    team_doc.exists = True
    team_doc.to_dict = MagicMock(return_value={"department_id": team_dept, "name": "Team A"})

    # task_assignments
    assign_doc = MagicMock()
    assign_doc.exists = True; assign_doc.id = "assign-001"
    assign_doc.to_dict = MagicMock(return_value={
        "complaint_id": "comp-001", "team_id": "team-001",
        "deadline": "2026-01-01T00:00:00", "assigned_at": "2026-01-01T00:00:00",
        "load_score": 0.5, "reason": "auto", "is_reassigned": False, "is_active": True,
    })

    db.collection.return_value.where.return_value.get.return_value = []
    db.collection.return_value.get.return_value = []

    return db


def _override_db(db):
    """Override the FastAPI get_db dependency with a mock."""
    app.dependency_overrides[get_db] = lambda: db


def _clear_overrides():
    app.dependency_overrides.clear()


def _token_for(user: User) -> str:
    from datetime import timedelta
    from app.auth import create_access_token
    return create_access_token(data={"sub": user.id, "role": user.role.value},
                                expires_delta=timedelta(minutes=30))


def _auth(user: User) -> dict:
    return {"Authorization": f"Bearer {_token_for(user)}"}


@pytest.fixture
def client():
    return TestClient(app)


# ─── Registration ──────────────────────────────────────────────────────────────

class TestRegistration:
    def test_register_always_citizen(self, client):
        """role=officer in payload must be stripped -> citizen returned."""
        db = MagicMock()
        # No existing user
        db.collection.return_value.where.return_value.limit.return_value.get.return_value = []
        new_ref = MagicMock(); new_ref.id = "new-001"; new_ref.set = MagicMock()
        db.collection.return_value.document.return_value = new_ref
        # token lookup for user doc after creation: return user doc
        user_doc = MagicMock(); user_doc.exists = True
        new_ref.get.return_value = user_doc

        _override_db(db)
        try:
            r = client.post("/api/auth/register", json={
                "email": "bad@evil.com", "password": "StrongPass1!", "name": "Attacker",
                "role": "officer", "department_id": "dept-xyz",
            })
        finally:
            _clear_overrides()

        assert r.status_code == 201
        assert r.json()["user"]["role"] == "citizen"

    def test_duplicate_email_400(self, client):
        user = _make_user()
        db = _fake_db(user=user)
        _override_db(db)
        try:
            r = client.post("/api/auth/register", json={
                "email": user.email, "password": "Pass1234!", "name": "Dup",
            })
        finally:
            _clear_overrides()
        assert r.status_code == 400


# ─── Login ─────────────────────────────────────────────────────────────────────

class TestLogin:
    def test_login_embeds_role_in_token(self, client):
        from app.auth import get_password_hash, decode_token
        user = _make_user()
        user.password_hash = get_password_hash("Correct1!")
        db = _fake_db(user=user)
        _override_db(db)
        try:
            r = client.post("/api/auth/login/json",
                            json={"email": user.email, "password": "Correct1!"})
        finally:
            _clear_overrides()
        assert r.status_code == 200
        assert decode_token(r.json()["access_token"])["role"] == "citizen"

    def test_wrong_password_401(self, client):
        from app.auth import get_password_hash
        user = _make_user()
        user.password_hash = get_password_hash("RightPass1!")
        db = _fake_db(user=user)
        _override_db(db)
        try:
            r = client.post("/api/auth/login/json",
                            json={"email": user.email, "password": "WrongPass!"})
        finally:
            _clear_overrides()
        assert r.status_code == 401

    def test_unknown_email_401(self, client):
        db = MagicMock()
        db.collection.return_value.where.return_value.limit.return_value.get.return_value = []
        _override_db(db)
        try:
            r = client.post("/api/auth/login/json",
                            json={"email": "ghost@nowhere.com", "password": "Any1!"})
        finally:
            _clear_overrides()
        assert r.status_code == 401


# ─── Upload ownership ──────────────────────────────────────────────────────────

class TestUploadOwnership:
    def test_owner_can_upload(self, client, tmp_path):
        user = _make_user(uid="user-001")
        complaint = _make_complaint(user_id="user-001")
        db = _fake_db(user=user, complaint=complaint)
        _override_db(db)
        try:
            with patch("app.routers.citizens.CITIZEN_UPLOAD_DIR", str(tmp_path)):
                r = client.post(f"/api/complaints/{complaint.id}/upload-images",
                                headers=_auth(user),
                                files=[("files", ("p.jpg", io.BytesIO(_valid_jpeg_bytes()), "image/jpeg"))])
        finally:
            _clear_overrides()
        assert r.status_code == 200
        assert r.json()["rejected"] == []

    def test_non_owner_gets_403(self, client, tmp_path):
        stranger = _make_user(uid="user-999", email="stranger@test.in")
        complaint = _make_complaint(user_id="user-001")
        db = _fake_db(user=stranger, complaint=complaint)
        _override_db(db)
        try:
            r = client.post(f"/api/complaints/{complaint.id}/upload-images",
                            headers=_auth(stranger),
                            files=[("files", ("p.jpg", io.BytesIO(_valid_jpeg_bytes()), "image/jpeg"))])
        finally:
            _clear_overrides()
        assert r.status_code == 403

    def test_unauthenticated_401(self, client):
        r = client.post("/api/complaints/comp-001/upload-images",
                        files=[("files", ("p.jpg", io.BytesIO(b"x"), "image/jpeg"))])
        assert r.status_code == 401


# ─── Upload validation ─────────────────────────────────────────────────────────

class TestUploadValidation:
    def _up(self, client, tmp_path, data, ctype, fname="file"):
        user = _make_user()
        complaint = _make_complaint()
        db = _fake_db(user=user, complaint=complaint)
        _override_db(db)
        try:
            with patch("app.routers.citizens.CITIZEN_UPLOAD_DIR", str(tmp_path)):
                r = client.post(f"/api/complaints/{complaint.id}/upload-images",
                                headers=_auth(user),
                                files=[("files", (fname, io.BytesIO(data), ctype))])
        finally:
            _clear_overrides()
        return r

    def test_valid_jpeg_accepted(self, client, tmp_path):
        r = self._up(client, tmp_path, _valid_jpeg_bytes(), "image/jpeg", "ok.jpg")
        assert r.status_code == 200
        assert len(r.json()["attachments"]) == 1
        assert r.json()["rejected"] == []

    def test_html_mime_rejected(self, client, tmp_path):
        r = self._up(client, tmp_path, b"<h1>xss</h1>", "text/html", "evil.html")
        assert r.status_code == 200
        assert r.json()["attachments"] == []
        assert "Unsupported" in r.json()["rejected"][0]["reason"]

    def test_gif_mime_rejected(self, client, tmp_path):
        r = self._up(client, tmp_path, b"GIF89a", "image/gif", "anim.gif")
        assert r.status_code == 200
        assert r.json()["attachments"] == []
        assert "Unsupported" in r.json()["rejected"][0]["reason"]

    def test_oversized_file_rejected(self, client, tmp_path):
        big = b"A" * (6 * 1024 * 1024)
        r = self._up(client, tmp_path, big, "image/jpeg", "big.jpg")
        assert r.status_code == 200
        assert r.json()["attachments"] == []
        assert "5MB" in r.json()["rejected"][0]["reason"]

    def test_corrupt_jpeg_rejected(self, client, tmp_path):
        r = self._up(client, tmp_path, b"\xff\xd8NOTREALJPEG\xff\xd9", "image/jpeg", "bad.jpg")
        assert r.status_code == 200
        assert r.json()["attachments"] == []
        assert "Invalid" in r.json()["rejected"][0]["reason"]

    def test_path_traversal_sanitized(self, client, tmp_path):
        r = self._up(client, tmp_path, _valid_jpeg_bytes(), "image/jpeg", "../../etc/passwd.jpg")
        assert r.status_code == 200
        for path in r.json()["attachments"]:
            assert ".." not in path and "etc" not in path


# ─── Analytics authorization ───────────────────────────────────────────────────

class TestAnalyticsAuth:
    BLOCKED = [
        "/api/analytics/departments/performance",
        "/api/analytics/smart-alerts",
        "/api/analytics/recurring-issues",
        "/api/analytics/summary",
    ]

    def test_citizen_gets_403(self, client):
        user = _make_user()
        db = _fake_db(user=user)
        _override_db(db)
        try:
            for route in self.BLOCKED:
                r = client.get(route, headers=_auth(user))
                assert r.status_code == 403, f"{route} should be 403 for citizen, got {r.status_code}"
        finally:
            _clear_overrides()

    def test_no_token_gets_401(self, client):
        for route in self.BLOCKED:
            r = client.get(route)
            assert r.status_code == 401


# ─── Assignment authorization ──────────────────────────────────────────────────

class TestAssignmentAuth:
    def test_citizen_cannot_list_teams(self, client):
        user = _make_user()
        db = _fake_db(user=user)
        _override_db(db)
        try:
            r = client.get("/api/assignments/teams", headers=_auth(user))
        finally:
            _clear_overrides()
        assert r.status_code == 403

    def test_citizen_cannot_get_assignment(self, client):
        user = _make_user()
        db = _fake_db(user=user)
        _override_db(db)
        try:
            r = client.get("/api/assignments/assign-001", headers=_auth(user))
        finally:
            _clear_overrides()
        assert r.status_code == 403

    def test_unauthenticated_cannot_override(self, client):
        r = client.post("/api/assignments/assign-001/override",
                        json={"new_team_id": "t2", "reason": "test"})
        assert r.status_code == 401

    def test_officer_dept_param_ignored(self, client):
        officer = _make_officer(department_id="dept-water")
        db = _fake_db(user=officer)
        db.collection.return_value.where.return_value.get.return_value = []
        _override_db(db)
        try:
            r = client.get("/api/assignments/teams?department_id=dept-OTHER",
                           headers=_auth(officer))
        finally:
            _clear_overrides()
        assert r.status_code == 200
        # The where() call must have used officer's own dept
        where_calls = str(db.collection.return_value.where.call_args_list)
        assert "dept-water" in where_calls


# ─── Config security ───────────────────────────────────────────────────────────

class TestConfigSecurity:
    def test_default_secret_ok_in_development(self):
        from app.config import Settings, _DEFAULT_SECRET
        s = Settings(); s.ENVIRONMENT = "development"; s.SECRET_KEY = _DEFAULT_SECRET
        s.validate()

    def test_default_secret_kills_in_production(self):
        from app.config import Settings, _DEFAULT_SECRET
        s = Settings(); s.ENVIRONMENT = "production"; s.SECRET_KEY = _DEFAULT_SECRET
        with pytest.raises(SystemExit):
            s.validate()

    def test_strong_secret_ok_in_production(self):
        from app.config import Settings
        s = Settings(); s.ENVIRONMENT = "production"
        s.SECRET_KEY = "super-strong-random-key-not-default-abc123XYZ"
        s.validate()
