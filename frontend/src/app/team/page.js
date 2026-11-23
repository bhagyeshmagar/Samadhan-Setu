'use client';

import withRoleGuard from '@/components/withRoleGuard';

function LegacyTeamRedirect() {
    return null;
}

export default withRoleGuard(LegacyTeamRedirect, {
    redirectOnly: true,
    loadingLabel: 'Redirecting to Team Dashboard…',
});
