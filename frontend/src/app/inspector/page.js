'use client';

import withRoleGuard from '@/components/withRoleGuard';

function LegacyInspectorRedirect() {
    return null;
}

export default withRoleGuard(LegacyInspectorRedirect, {
    redirectOnly: true,
    loadingLabel: 'Redirecting to Inspection Dashboard…',
});
