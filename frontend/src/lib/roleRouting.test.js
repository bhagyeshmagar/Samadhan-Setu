import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getDashboardForRole,
    getPostLoginDestination,
    sanitizeNextPath,
    resolveRouteDecision,
} from './roleRouting.js';
import { signSessionToken, verifySessionToken } from './sessionCookie.js';

test('getDashboardForRole maps every role to its canonical dashboard path', () => {
    assert.equal(getDashboardForRole('nodal_officer'), '/nodal-dashboard');
    assert.equal(getDashboardForRole('officer'), '/nodal-dashboard');
    assert.equal(getDashboardForRole('inspection_officer'), '/inspection-dashboard');
    assert.equal(getDashboardForRole('team_lead'), '/team-dashboard');
    assert.equal(getDashboardForRole('citizen'), '/citizen/track');
    assert.equal(getDashboardForRole('supervisor'), '/supervisor');
    assert.equal(getDashboardForRole('admin'), '/admin');
    assert.equal(getDashboardForRole(null), '/login');
});

test('resolveRouteDecision redirects unauthenticated users on protected and dispatcher routes to /login', () => {
    const protectedCheck = resolveRouteDecision({ pathname: '/nodal-dashboard', userRole: null });
    assert.equal(protectedCheck.action, 'redirect');
    assert.equal(protectedCheck.destination, '/login?next=%2Fnodal-dashboard');

    const dispatcherCheck = resolveRouteDecision({ pathname: '/dashboard', userRole: null });
    assert.equal(dispatcherCheck.action, 'redirect');
    assert.equal(dispatcherCheck.destination, '/login?next=%2Fdashboard');

    const legacyCheck = resolveRouteDecision({ pathname: '/inspector', userRole: null });
    assert.equal(legacyCheck.action, 'redirect');
    assert.equal(legacyCheck.destination, '/login?next=%2Finspection-dashboard');
});

test('resolveRouteDecision dispatches authenticated users from /dashboard and /department to their role dashboard', () => {
    assert.equal(
        resolveRouteDecision({ pathname: '/dashboard', userRole: 'nodal_officer' }).destination,
        '/nodal-dashboard'
    );
    assert.equal(
        resolveRouteDecision({ pathname: '/department', userRole: 'inspection_officer' }).destination,
        '/inspection-dashboard'
    );
    assert.equal(
        resolveRouteDecision({ pathname: '/dashboard', userRole: 'team_lead' }).destination,
        '/team-dashboard'
    );
    assert.equal(
        resolveRouteDecision({ pathname: '/dashboard', userRole: 'citizen' }).destination,
        '/citizen/track'
    );
});

test('resolveRouteDecision enforces strict cross-role redirection across officer dashboards', () => {
    assert.equal(
        resolveRouteDecision({ pathname: '/nodal-dashboard', userRole: 'nodal_officer' }).action,
        'allow'
    );
    assert.equal(
        resolveRouteDecision({ pathname: '/nodal-dashboard', userRole: 'inspection_officer' }).destination,
        '/inspection-dashboard'
    );
    assert.equal(
        resolveRouteDecision({ pathname: '/inspection-dashboard', userRole: 'team_lead' }).destination,
        '/team-dashboard'
    );
    assert.equal(
        resolveRouteDecision({ pathname: '/team-dashboard', userRole: 'nodal_officer' }).destination,
        '/nodal-dashboard'
    );
    assert.equal(
        resolveRouteDecision({ pathname: '/team-dashboard', userRole: 'citizen' }).destination,
        '/citizen/track'
    );
    assert.equal(
        resolveRouteDecision({ pathname: '/nodal-dashboard', userRole: 'admin' }).action,
        'allow'
    );
});

test('resolveRouteDecision redirects legacy /nodal, /inspector, and /team URLs to canonical routes', () => {
    assert.equal(
        resolveRouteDecision({ pathname: '/nodal', userRole: 'nodal_officer' }).destination,
        '/nodal-dashboard'
    );
    assert.equal(
        resolveRouteDecision({ pathname: '/inspector', userRole: 'inspection_officer' }).destination,
        '/inspection-dashboard'
    );
    assert.equal(
        resolveRouteDecision({ pathname: '/team', userRole: 'team_lead' }).destination,
        '/team-dashboard'
    );
    // Wrong-role user hitting a legacy path still lands on their own dashboard
    assert.equal(
        resolveRouteDecision({ pathname: '/nodal', userRole: 'team_lead' }).destination,
        '/team-dashboard'
    );
});

test('sanitizeNextPath blocks external URLs, protocol-relative paths, and login loops', () => {
    assert.equal(sanitizeNextPath('/inspection-dashboard'), '/inspection-dashboard');
    assert.equal(sanitizeNextPath('https://evil.example/phish'), null);
    assert.equal(sanitizeNextPath('//evil.example/phish'), null);
    assert.equal(sanitizeNextPath('javascript:alert(1)'), null);
    assert.equal(sanitizeNextPath('/login?foo=1'), null);
    assert.equal(sanitizeNextPath('/api/auth/logout'), null);
});

test('getPostLoginDestination respects authorized next paths and overrides unauthorized ones', () => {
    assert.equal(
        getPostLoginDestination('inspection_officer', '/inspection-dashboard'),
        '/inspection-dashboard'
    );
    assert.equal(
        getPostLoginDestination('inspection_officer', '/nodal-dashboard'),
        '/inspection-dashboard'
    );
    assert.equal(
        getPostLoginDestination('team_lead', 'https://evil.com'),
        '/team-dashboard'
    );
});

test('signSessionToken and verifySessionToken reject tampered and expired tokens', () => {
    const token = signSessionToken({
        sub: 'usr-1',
        role: 'inspection_officer',
        email: 'inspector1@roads.gov.in',
    });
    const verified = verifySessionToken(token);
    assert.equal(verified?.sub, 'usr-1');
    assert.equal(verified?.role, 'inspection_officer');

    // Tamper payload role
    const [payloadB64, sigB64] = token.split('.');
    const forgedPayload = Buffer.from(
        JSON.stringify({ sub: 'usr-1', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 })
    )
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    assert.equal(verifySessionToken(`${forgedPayload}.${sigB64}`), null);

    // Expired token
    const expired = signSessionToken(
        { sub: 'usr-1', role: 'team_lead', email: 'teamlead1@roads.gov.in' },
        -10
    );
    assert.equal(verifySessionToken(expired), null);
});
