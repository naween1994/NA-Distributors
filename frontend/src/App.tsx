import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AppProvider, useApp } from './context';
import { Loading, Empty, Card, ErrorBox } from './components/ui';
import Layout, { PasswordForm } from './components/Layout';
import Login from './pages/Login';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Customers = lazy(() => import('./pages/Customers'));
const Orders = lazy(() => import('./pages/Orders'));
const NewOrder = lazy(() => import('./pages/Orders').then((m) => ({ default: m.NewOrder })));
const Reports = lazy(() => import('./pages/Reports'));
const Scanner = lazy(() => import('./pages/Scanner'));
const Users = lazy(() => import('./pages/Users'));
const Settings = lazy(() => import('./pages/Settings'));
const Reminders = lazy(() => import('./pages/Reminders'));
const Accounting = lazy(() => import('./pages/Accounting'));
const Mobile = lazy(() => import('./pages/Mobile'));
function Guard({ permission, children }: { permission: string; children: React.ReactNode }) {
  const { can } = useApp();
  return can(permission) ? (
    children
  ) : (
    <Card>
      <Empty
        title="This area needs a little more access."
        description="Ask your administrator to update your permissions."
        action={
          <Link to="/" className="button secondary">
            Go to dashboard
          </Link>
        }
      />
    </Card>
  );
}
function Workspace() {
  const { user, loading, setupRequired, error, refresh } = useApp();
  if (loading)
    return (
      <div className="app-start">
        <Loading />
      </div>
    );
  if (!user || setupRequired || error) return <Login />;
  if (user.mustChangePassword) return <PasswordForm required />;
  const pages = [
    { path: '/', permission: 'viewDashboard', element: <Dashboard /> },
    { path: '/inventory', permission: 'viewInventory', element: <Inventory /> },
    { path: '/customers', permission: 'viewCustomers', element: <Customers /> },
    { path: '/orders', permission: 'viewOrders', element: <Orders /> },
    { path: '/orders/new', permission: 'createOrders', element: <NewOrder /> },
    { path: '/reports', permission: 'viewReports', element: <Reports /> },
    { path: '/scan', permission: 'scan', element: <Scanner /> },
    { path: '/users', permission: 'manageUsers', element: <Users /> },
    { path: '/settings', permission: 'manageSettings', element: <Settings /> },
    { path: '/reminders', permission: 'viewOrders', element: <Reminders /> },
    { path: '/accounting', permission: 'accounting', element: <Accounting /> },
  ];
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<Layout />}>
          {pages.map((p) => (
            <Route
              path={p.path}
              key={p.path}
              element={<Guard permission={p.permission}>{p.element}</Guard>}
            />
          ))}
          <Route path="/mobile" element={<Mobile />} />
          <Route
            path="*"
            element={
              <Card>
                <Empty
                  title="This page has moved out of reach."
                  description="Use the sidebar to find your way back."
                  action={
                    <Link to="/" className="button primary">
                      Back to your workspace
                    </Link>
                  }
                />
              </Card>
            }
          />
        </Route>
      </Routes>
    </Suspense>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Workspace />
      </AppProvider>
    </BrowserRouter>
  );
}
