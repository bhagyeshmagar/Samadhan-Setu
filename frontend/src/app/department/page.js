'use client';

import withRoleGuard from '@/components/withRoleGuard';

function DepartmentDispatcher() {
    return null;
}

export default withRoleGuard(DepartmentDispatcher, {
    redirectOnly: true,
    loadingLabel: 'Routing to your departmental dashboard…',
});
