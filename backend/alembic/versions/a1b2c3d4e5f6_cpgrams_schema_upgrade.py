"""samadhan_setu_schema_upgrade

Revision ID: a1b2c3d4e5f6
Revises: fe28d94740d4
Create Date: 2026-10-22 16:15:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = 'fe28d94740d4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Update Enums in PostgreSQL
    # PostgreSQL requires ADD VALUE inside autocommit block
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE complaint_status ADD VALUE IF NOT EXISTS 'appealed'")
        op.execute("ALTER TYPE complaint_status ADD VALUE IF NOT EXISTS 'appealed_l1'")
        op.execute("ALTER TYPE complaint_status ADD VALUE IF NOT EXISTS 'appealed_l2'")
        op.execute("ALTER TYPE media_type ADD VALUE IF NOT EXISTS 'inspection_photo'")

    # 2. Add columns to complaints if not exist
    inspector = sa.inspect(conn)
    existing_cols = {col['name'] for col in inspector.get_columns('complaints')}

    if 'citizen_rating' not in existing_cols:
        op.add_column('complaints', sa.Column('citizen_rating', sa.Integer(), nullable=True))
    if 'feedback_text' not in existing_cols:
        op.add_column('complaints', sa.Column('feedback_text', sa.Text(), nullable=True))
    if 'action_taken_report' not in existing_cols:
        op.add_column('complaints', sa.Column('action_taken_report', sa.Text(), nullable=True))
    if 'atr_submitted_at' not in existing_cols:
        op.add_column('complaints', sa.Column('atr_submitted_at', sa.DateTime(timezone=True), nullable=True))
    if 'satisfaction_status' not in existing_cols:
        op.add_column('complaints', sa.Column('satisfaction_status', sa.String(length=50), nullable=True))
    if 'appeal_level' not in existing_cols:
        op.add_column('complaints', sa.Column('appeal_level', sa.Integer(), server_default='0', nullable=False))
    if 'appeal_remarks' not in existing_cols:
        op.add_column('complaints', sa.Column('appeal_remarks', sa.Text(), nullable=True))

    # 3. Unique constraint on citizen_feedback
    fb_constraints = {c['name'] for c in inspector.get_unique_constraints('citizen_feedback')}
    if 'uq_complaint_citizen_feedback' not in fb_constraints:
        # Deduplicate first just in case
        op.execute("""
            DELETE FROM citizen_feedback a USING citizen_feedback b
            WHERE a.id < b.id 
              AND a.complaint_id = b.complaint_id 
              AND a.citizen_id = b.citizen_id;
        """)
        op.create_unique_constraint(
            'uq_complaint_citizen_feedback',
            'citizen_feedback',
            ['complaint_id', 'citizen_id']
        )

    # 4. Composite indexes
    indexes = {idx['name'] for idx in inspector.get_indexes('complaints')}
    if 'ix_complaints_dept_status_pri' not in indexes:
        op.create_index(
            'ix_complaints_dept_status_pri',
            'complaints',
            ['department_id', 'status', 'priority_score']
        )
    if 'ix_complaints_ward_cat_created' not in indexes:
        op.create_index(
            'ix_complaints_ward_cat_created',
            'complaints',
            ['ward', 'category', 'created_at']
        )


def downgrade() -> None:
    op.drop_index('ix_complaints_ward_cat_created', table_name='complaints')
    op.drop_index('ix_complaints_dept_status_pri', table_name='complaints')
    op.drop_constraint('uq_complaint_citizen_feedback', 'citizen_feedback', type_='unique')
    op.drop_column('complaints', 'appeal_remarks')
    op.drop_column('complaints', 'appeal_level')
    op.drop_column('complaints', 'satisfaction_status')
    op.drop_column('complaints', 'atr_submitted_at')
    op.drop_column('complaints', 'action_taken_report')
    op.drop_column('complaints', 'feedback_text')
    op.drop_column('complaints', 'citizen_rating')
