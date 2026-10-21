"""
Integration tests for Samadhan Setu — Security Containment & Scoping.
Validates role-based authorization, citizen upload isolation, file validation,
department scoping, and configuration security.
"""
import io
import uuid
import pytest
import pytest_asyncio
import httpx
from unittest.mock import patch

from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.main import app
from app.config import settings
from app.db.session import get_async_session
from app.auth import get_current_user, create_access_token, decode_token, get_password_hash
from app.models.orm import (
    User,
    UserRole,
    Complaint,
    ComplaintStatus,
    ComplaintPriority,
    Department,
    Officer,
)

# Test engine with NullPool so each test connection is isolated
test_engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
TestSessionLocal = async_sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)

async def _test_get_async_session():
    async with TestSessionLocal() as session:
        yield session


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _make_user(uid=None, email=None, name="Test Citizen", role=UserRole.CITIZEN):
    return User(
        id=uid or uuid.uuid4(),
        email=email or f"user_{uuid.uuid4().hex[:8]}@test.in",
        name=name,
        password_hash=get_password_hash("SecurePass123!"),
        role=role,
        is_active=True,
    )


def _make_officer(uid=None, department_id=None):
    dept_id = department_id or uuid.uuid4()
    user = _make_user(uid=uid, email=f"officer_{uuid.uuid4().hex[:8]}@test.in", role=UserRole.OFFICER)
    profile = Officer(
        id=uuid.uuid4(),
        user_id=user.id,
        department_id=dept_id,
        employee_id=f"EMP-{uuid.uuid4().hex[:6]}",
        designation="Field Officer",
    )
    user.officer_profile = profile
    return user, dept_id


def _make_complaint(complaint_id=None, citizen_id=None, department_id=None):
    c = Complaint(
        id=complaint_id or uuid.uuid4(),
        complaint_number=f"SS-2026-{uuid.uuid4().hex[:6]}",
        citizen_id=citizen_id or uuid.uuid4(),
        department_id=department_id or uuid.uuid4(),
        title="Pothole in Ward 12",
        description="Dangerous pothole causing road traffic issue",
        category="Roads & Transport",
        priority=ComplaintPriority.MEDIUM,
        status=ComplaintStatus.SUBMITTED,
    )
    c.media = []
    return c


def _valid_jpeg_bytes():
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color=(255, 0, 0)).save(buf, format="JPEG")
    return buf.getvalue()


@pytest_asyncio.fixture
async def client():
    app.dependency_overrides.clear()
    app.dependency_overrides[get_async_session] = _test_get_async_session
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac
    app.dependency_overrides.clear()


# ─── Registration ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestRegistration:
    async def test_register_always_citizen(self, client):
        """role=officer in client payload must be forced to citizen."""
        email = f"attacker_{uuid.uuid4().hex[:8]}@test.in"
        r = await client.post("/api/auth/register", json={
            "email": email,
            "password": "StrongPassword123!",
            "name": "Attacker",
            "role": "officer",
            "department_id": str(uuid.uuid4()),
        })
        assert r.status_code == 201
        assert r.json()["user"]["role"] == "citizen"

    async def test_duplicate_email_400(self, client):
        email = f"dup_{uuid.uuid4().hex[:8]}@test.in"
        r1 = await client.post("/api/auth/register", json={
            "email": email,
            "password": "StrongPassword123!",
            "name": "User 1",
        })
        assert r1.status_code == 201

        r2 = await client.post("/api/auth/register", json={
            "email": email,
            "password": "OtherPassword123!",
            "name": "User 2",
        })
        assert r2.status_code == 400
        assert "already registered" in r2.json()["detail"].lower()

    async def test_duplicate_phone_400(self, client):
        phone = f"+9198{uuid.uuid4().int % 100000000:08d}"
        r1 = await client.post("/api/auth/register", json={
            "email": f"phone1_{uuid.uuid4().hex[:8]}@test.in",
            "password": "StrongPassword123!",
            "name": "Phone User 1",
            "phone": phone,
        })
        assert r1.status_code == 201

        r2 = await client.post("/api/auth/register", json={
            "email": f"phone2_{uuid.uuid4().hex[:8]}@test.in",
            "password": "StrongPassword123!",
            "name": "Phone User 2",
            "phone": phone,
        })
        assert r2.status_code == 400
        assert "phone" in r2.json()["detail"].lower()


# ─── Login ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestLogin:
    async def test_login_embeds_role_in_token(self, client):
        email = f"login_{uuid.uuid4().hex[:8]}@test.in"
        password = "CorrectPassword123!"
        r_reg = await client.post("/api/auth/register", json={
            "email": email,
            "password": password,
            "name": "Login User",
        })
        assert r_reg.status_code == 201

        r_login = await client.post("/api/auth/login/json", json={
            "email": email,
            "password": password,
        })
        assert r_login.status_code == 200
        token = r_login.json()["access_token"]
        claims = decode_token(token)
        assert claims["role"] == "citizen"

    async def test_wrong_password_401(self, client):
        email = f"wrong_{uuid.uuid4().hex[:8]}@test.in"
        await client.post("/api/auth/register", json={
            "email": email,
            "password": "CorrectPassword123!",
            "name": "Wrong Pass User",
        })
        r = await client.post("/api/auth/login/json", json={
            "email": email,
            "password": "WrongPassword123!",
        })
        assert r.status_code == 401

    async def test_unknown_email_401(self, client):
        r = await client.post("/api/auth/login/json", json={
            "email": "ghost_nonexistent@nowhere.in",
            "password": "AnyPassword123!",
        })
        assert r.status_code == 401


# ─── Upload Ownership ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestUploadOwnership:
    async def test_owner_can_upload(self, client, tmp_path):
        owner = _make_user()
        complaint = _make_complaint(citizen_id=owner.id)

        app.dependency_overrides[get_current_user] = lambda: owner
        with patch("app.repositories.complaint_repo.ComplaintRepository.get_by_id", return_value=complaint), \
             patch("app.repositories.complaint_repo.ComplaintRepository.add_media_proof", return_value=None), \
             patch("app.routers.citizens.CITIZEN_UPLOAD_DIR", str(tmp_path)):
            r = await client.post(
                f"/api/complaints/{complaint.id}/upload-images",
                files=[("files", ("photo.jpg", io.BytesIO(_valid_jpeg_bytes()), "image/jpeg"))],
            )
        assert r.status_code == 200
        assert len(r.json()["uploaded"]) == 1
        assert r.json()["rejected"] == []

    async def test_non_owner_gets_403(self, client, tmp_path):
        owner = _make_user()
        stranger = _make_user()
        complaint = _make_complaint(citizen_id=owner.id)

        app.dependency_overrides[get_current_user] = lambda: stranger
        with patch("app.repositories.complaint_repo.ComplaintRepository.get_by_id", return_value=complaint), \
             patch("app.routers.citizens.CITIZEN_UPLOAD_DIR", str(tmp_path)):
            r = await client.post(
                f"/api/complaints/{complaint.id}/upload-images",
                files=[("files", ("photo.jpg", io.BytesIO(_valid_jpeg_bytes()), "image/jpeg"))],
            )
        assert r.status_code == 403
        assert "owner" in r.json()["detail"].lower()

    async def test_unauthenticated_401(self, client):
        r = await client.post(
            f"/api/complaints/{uuid.uuid4()}/upload-images",
            files=[("files", ("photo.jpg", io.BytesIO(b"dummy"), "image/jpeg"))],
        )
        assert r.status_code == 401


# ─── Upload Validation ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestUploadValidation:
    async def _up(self, client, tmp_path, data, ctype, fname="file"):
        owner = _make_user()
        complaint = _make_complaint(citizen_id=owner.id)

        app.dependency_overrides[get_current_user] = lambda: owner
        with patch("app.repositories.complaint_repo.ComplaintRepository.get_by_id", return_value=complaint), \
             patch("app.repositories.complaint_repo.ComplaintRepository.add_media_proof", return_value=None), \
             patch("app.routers.citizens.CITIZEN_UPLOAD_DIR", str(tmp_path)):
            r = await client.post(
                f"/api/complaints/{complaint.id}/upload-images",
                files=[("files", (fname, io.BytesIO(data), ctype))],
            )
        return r

    async def test_valid_jpeg_accepted(self, client, tmp_path):
        r = await self._up(client, tmp_path, _valid_jpeg_bytes(), "image/jpeg", "ok.jpg")
        assert r.status_code == 200
        assert len(r.json()["uploaded"]) == 1
        assert r.json()["rejected"] == []

    async def test_html_mime_rejected(self, client, tmp_path):
        r = await self._up(client, tmp_path, b"<h1>xss</h1>", "text/html", "evil.html")
        assert r.status_code == 200
        assert r.json()["uploaded"] == []
        assert "Unsupported" in r.json()["rejected"][0]["reason"]

    async def test_gif_mime_rejected(self, client, tmp_path):
        r = await self._up(client, tmp_path, b"GIF89a", "image/gif", "anim.gif")
        assert r.status_code == 200
        assert r.json()["uploaded"] == []
        assert "Unsupported" in r.json()["rejected"][0]["reason"]

    async def test_oversized_file_rejected(self, client, tmp_path):
        big = b"A" * (6 * 1024 * 1024)
        r = await self._up(client, tmp_path, big, "image/jpeg", "big.jpg")
        assert r.status_code == 200
        assert r.json()["uploaded"] == []
        assert "5MB" in r.json()["rejected"][0]["reason"]

    async def test_corrupt_jpeg_rejected(self, client, tmp_path):
        r = await self._up(client, tmp_path, b"\xff\xd8NOTREALJPEG\xff\xd9", "image/jpeg", "bad.jpg")
        assert r.status_code == 200
        assert r.json()["uploaded"] == []
        assert "Invalid" in r.json()["rejected"][0]["reason"]

    async def test_path_traversal_sanitized(self, client, tmp_path):
        r = await self._up(client, tmp_path, _valid_jpeg_bytes(), "image/jpeg", "../../etc/passwd.jpg")
        assert r.status_code == 200
        for path in r.json()["uploaded"]:
            assert ".." not in path and "etc" not in path


# ─── Analytics Authorization ───────────────────────────────────────────────────

@pytest.mark.asyncio
class TestAnalyticsAuth:
    BLOCKED = [
        "/api/analytics/departments/performance",
        "/api/analytics/smart-alerts",
        "/api/analytics/summary",
        "/api/analytics/map-data",
    ]

    async def test_citizen_gets_403(self, client):
        citizen = _make_user(role=UserRole.CITIZEN)
        app.dependency_overrides[get_current_user] = lambda: citizen

        for route in self.BLOCKED:
            r = await client.get(route)
            assert r.status_code == 403, f"{route} should return 403 for citizen, got {r.status_code}"

    async def test_no_token_gets_401(self, client):
        for route in self.BLOCKED:
            r = await client.get(route)
            assert r.status_code == 401


# ─── Assignment Authorization & Department Scoping ────────────────────────────

@pytest.mark.asyncio
class TestAssignmentAuth:
    async def test_citizen_cannot_list_teams(self, client):
        citizen = _make_user(role=UserRole.CITIZEN)
        app.dependency_overrides[get_current_user] = lambda: citizen

        r = await client.get("/api/assignments/teams")
        assert r.status_code == 403

    async def test_citizen_cannot_list_assignments(self, client):
        citizen = _make_user(role=UserRole.CITIZEN)
        app.dependency_overrides[get_current_user] = lambda: citizen

        r = await client.get("/api/assignments/")
        assert r.status_code == 403

    async def test_unauthenticated_cannot_reassign(self, client):
        r = await client.post(f"/api/assignments/{uuid.uuid4()}/reassign",
                              json={"team_id": str(uuid.uuid4()), "reason": "emergency"})
        assert r.status_code == 401

    async def test_officer_without_profile_gets_403(self, client):
        officer_no_profile = _make_user(role=UserRole.OFFICER)
        app.dependency_overrides[get_current_user] = lambda: officer_no_profile

        with patch("app.repositories.user_repo.UserRepository.get_officer_by_user_id", return_value=None):
            r = await client.get("/api/assignments/teams")
        assert r.status_code == 403


# ─── Config Security ───────────────────────────────────────────────────────────

class TestConfigSecurity:
    def test_default_secret_ok_in_development(self):
        from app.config import Settings, _DEFAULT_SECRET
        s = Settings()
        s.ENVIRONMENT = "development"
        s.SECRET_KEY = _DEFAULT_SECRET
        s.validate()

    def test_default_secret_kills_in_production(self):
        from app.config import Settings, _DEFAULT_SECRET
        s = Settings()
        s.ENVIRONMENT = "production"
        s.SECRET_KEY = _DEFAULT_SECRET
        with pytest.raises(SystemExit):
            s.validate()

    def test_strong_secret_ok_in_production(self):
        from app.config import Settings
        s = Settings()
        s.ENVIRONMENT = "production"
        s.SECRET_KEY = "super-strong-random-key-not-default-abc123XYZ"
        s.validate()
