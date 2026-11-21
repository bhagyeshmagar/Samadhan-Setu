"""add_sla_events_and_ai_priority_and_audit_hash

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-11-21 03:00:00.000000

H-01, H-08, H-09, M-21 FIX:
- Add sla_started_at, ai_priority, and ai_priority_score to complaints
- Create immutable sla_events audit ledger table
- Add previous_hash and record_hash to audit_logs for SHA-256 chaining
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add columns to complaints
    op.add_column('complaints', sa.Column('sla_started_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('complaints', sa.Column('ai_priority', postgresql.ENUM('low', 'medium', 'high', 'critical', name='complaint_priority', create_type=False), nullable=True))
    op.add_column('complaints', sa.Column('ai_priority_score', sa.Float(), server_default='0.0', nullable=False))

    # 2. Create sla_events table
    op.create_table(
        'sla_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('complaint_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('complaints.id', ondelete='CASCADE'), nullable=False),
        sa.Column('event_type', sa.String(length=50), nullable=False),
        sa.Column('sla_hours', sa.Integer(), nullable=True),
        sa.Column('previous_deadline', sa.DateTime(timezone=True), nullable=True),
        sa.Column('new_deadline', sa.DateTime(timezone=True), nullable=True),
        sa.Column('actor_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('actor_role', sa.String(length=50), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_sla_events_complaint_id', 'sla_events', ['complaint_id'])
    op.create_index('ix_sla_events_event_type', 'sla_events', ['event_type'])
    op.create_index('ix_sla_events_created_at', 'sla_events', ['created_at'])

    # 3. Add hash chaining columns to audit_logs
    op.add_column('audit_logs', sa.Column('previous_hash', sa.String(length=64), nullable=True))
    op.add_column('audit_logs', sa.Column('record_hash', sa.String(length=64), nullable=True))
    op.create_index('ix_audit_logs_record_hash', 'audit_logs', ['record_hash'])


def downgrade() -> None:
    op.drop_index('ix_audit_logs_record_hash', table_name='audit_logs')
    op.drop_column('audit_logs', 'record_hash')
    op.drop_column('audit_logs', 'previous_hash')

    op.drop_index('ix_sla_events_created_at', table_name='sla_events')
    op.drop_index('ix_sla_events_event_type', table_name='sla_events')
    op.drop_index('ix_sla_events_complaint_id', table_name='sla_events')
    op.drop_table('sla_events')

    op.drop_column('complaints', 'ai_priority_score')
    op.drop_column('complaints', 'ai_priority')
    op.drop_column('complaints', 'sla_started_at')
