'use client';

import withRoleGuard from '@/components/withRoleGuard';

function DashboardDispatcher() {
    return null;
}

export default withRoleGuard(DashboardDispatcher, {
    redirectOnly: true,
    loadingLabel: 'Detecting your role dashboard…',
});
