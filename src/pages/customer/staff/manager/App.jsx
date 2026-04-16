import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import CustomerMenu from "./pages/customer/CustomerMenu.jsx";
import StaffLayout from "./pages/staff/StaffLayout.jsx";
import TablesPage from "./pages/staff/TablesPage.jsx";
import OrdersPage from "./pages/staff/OrdersPage.jsx";
import KitchenPage from "./pages/staff/KitchenPage.jsx";
import PaymentPage from "./pages/staff/PaymentPage.jsx";
import StockViewPage from "./pages/staff/StockViewPage.jsx";
import MyShiftPage from "./pages/staff/MyShiftPage.jsx";
import StockMgmtPage from "./pages/manager/StockMgmtPage.jsx";
import StaffMgmtPage from "./pages/manager/StaffMgmtPage.jsx";
import HappyHourPage from "./pages/manager/HappyHourPage.jsx";
import ReportsPage from "./pages/manager/ReportsPage.jsx";
import MembersPage from "./pages/manager/MembersPage.jsx";
import MerchMgmtPage from "./pages/manager/MerchMgmtPage.jsx";

function PrivateRoute({ children, managerOnly = false }) {
  const { session, staffUser, isManager, loading } = useAuth();
  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", color:"#888", fontFamily:"'Barlow Condensed',sans-serif",
      fontSize:14, letterSpacing:"2px" }}>YÜKLENIYOR...</div>
  );
  if (!session || !staffUser) return <Navigate to="/login" replace />;
  if (managerOnly && !isManager) return <Navigate to="/tables" replace />;
  return children;
}

function AppRoutes() {
  const { session, staffUser, isKitchen, isCashier } = useAuth();
  const defaultRoute = isKitchen ? "/kitchen" : isCashier ? "/payment" : "/tables";
  return (
    <Routes>
      <Route path="/login" element={
        session && staffUser ? <Navigate to={defaultRoute} replace /> : <LoginPage />
      }/>
      <Route path="/menu/:qrToken" element={<CustomerMenu />} />
      <Route path="/menu" element={<CustomerMenu />} />
      <Route path="/" element={
        <PrivateRoute><StaffLayout /></PrivateRoute>
      }>
        <Route index element={<Navigate to={defaultRoute} replace />} />
        <Route path="tables"     element={<TablesPage />} />
        <Route path="orders"     element={<OrdersPage />} />
        <Route path="kitchen"    element={<KitchenPage />} />
        <Route path="payment"    element={<PaymentPage />} />
        <Route path="stock"      element={<StockViewPage />} />
        <Route path="myshift"    element={<MyShiftPage />} />
        <Route path="stock-mgmt" element={<PrivateRoute managerOnly><StockMgmtPage /></PrivateRoute>} />
        <Route path="staff-mgmt" element={<PrivateRoute managerOnly><StaffMgmtPage /></PrivateRoute>} />
        <Route path="happy-hour" element={<PrivateRoute managerOnly><HappyHourPage /></PrivateRoute>} />
        <Route path="reports"    element={<PrivateRoute managerOnly><ReportsPage /></PrivateRoute>} />
        <Route path="members"    element={<PrivateRoute managerOnly><MembersPage /></PrivateRoute>} />
        <Route path="merch-mgmt" element={<PrivateRoute managerOnly><MerchMgmtPage /></PrivateRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
