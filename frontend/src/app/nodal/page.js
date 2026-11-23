'use client';

import withRoleGuard from '@/components/withRoleGuard';

function LegacyNodalRedirect() {
    return null;
}

export default withRoleGuard(LegacyNodalRedirect, {
    redirectOnly: true,
    loadingLabel: 'Redirecting to Nodal Dashboard…',
});
