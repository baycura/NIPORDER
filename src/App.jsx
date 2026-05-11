import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import CustomerMenu from "./pages/customer/CustomerMenu.jsx";
import StaffLayout from "./pages/staff/StaffLayout.jsx";
import TablesPage from "./pages/staff/TablesPage.jsx";
import OrdersPage from "./pages/staff/OrdersPage.jsx";
import OrderDetailPage from "./pages/staff/OrderDetailPage.jsx";
import KitchenPage from "./pages/staff/KitchenPage.jsx";
import KitchenDisplayPage from "./pages/staff/KitchenDisplayPage.jsx";
import PaymentPage from "./pages/staff/PaymentPage.jsx";
import StockViewPage from "./pages/staff/StockViewPage.jsx";
import MyShiftPage from "./pages/staff/MyShiftPage.jsx";
import StockMgmtPage from "./pages/manager/StockMgmtPage.jsx";
import StaffMgmtPage from "./pages/manager/StaffMgmtPage.jsx";
import HappyHourPage from "./pages/manager/HappyHourPage.jsx";
import CategorySchedulePage from "./pages/manager/CategorySchedulePage.jsx";
import QRCodesPage from "./pages/manager/QRCodesPage.jsx";
import ReportsPage from "./pages/manager/ReportsPage.jsx";
import MembersPage from "./pages/manager/MembersPage.jsx";
import MerchMgmtPage from "./pages/manager/MerchMgmtPage.jsx";
import SettingsPage from "./pages/manager/SettingsPage.jsx";
import MenuMgmtPage from "./pages/manager/MenuMgmtPage.jsx";
import TasksPage from "./pages/manager/TasksPage.jsx";
import TablesMgmtPage from "./pages/manager/TablesMgmtPage.jsx";
import RecipesMgmtPage from "./pages/manager/RecipesMgmtPage.jsx";
import InvoicesPage from "./pages/manager/InvoicesPage.jsx";

function PrivateRoute({ children, managerOnly = false, adminOnly = false }) {
  const { session, staffUser, isManager, isAdmin, loading } = useAuth();
  if (loading) return (<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:"#888",fontSize:14,letterSpacing:"2px"}}>YUKLENIYOR...</div>);
  if (!session || !staffUser) return (<Navigate to="/login" replace />);
  if (adminOnly && !isAdmin) return (<Navigate to="/tables" replace />);
  if (managerOnly && !isManager) return (<Navigate to="/tables" replace />);
  return children;
}

function AppRoutes() {
  const { session, staffUser, isKitchen, isCashier } = useAuth();
  const defaultRoute = isKitchen ? "/kitchen" : isCashier ? "/payment" : "/tables";
  return (
    <Routes>
      <Route path="/login" element={session && staffUser ? (<Navigate to={defaultRoute} replace />) : (<LoginPage />)}/>
      <Route path="/menu/:qrToken" element={<CustomerMenu />} />
      <Route path="/menu" element={<CustomerMenu />} />
      <Route path="/kitchen-display" element={<PrivateRoute><KitchenDisplayPage /></PrivateRoute>} />
      <Route path="/" element={<PrivateRoute><StaffLayout /></PrivateRoute>}>
        <Route index element={<Navigate to={defaultRoute} replace />} />
        <Route path="tables"           element={<TablesPage />} />
        <Route path="orders"           element={<OrdersPage />} />
        <Route path="orders/:orderId"  element={<OrderDetailPage />} />
        <Route path="kitchen"          element={<KitchenPage />} />
        <Route path="payment"          element={<PaymentPage />} />
        <Route path="stock"            element={<StockViewPage />} />
        <Route path="myshift"          element={<MyShiftPage />} />
        <Route path="stock-mgmt"       element={<PrivateRoute managerOnly><StockMgmtPage /></PrivateRoute>} />
        <Route path="staff-mgmt"       element={<PrivateRoute managerOnly><StaffMgmtPage /></PrivateRoute>} />
        <Route path="happy-hour"       element={<PrivateRoute managerOnly><HappyHourPage /></PrivateRoute>} />
        <Route path="category-schedule" element={<PrivateRoute managerOnly><CategorySchedulePage /></PrivateRoute>} />
        <Route path="qr-codes" element={<PrivateRoute managerOnly><QRCodesPage /></PrivateRoute>} />
        <Route path="tasks" element={<PrivateRoute><TasksPage /></PrivateRoute>} />
        <Route path="reports"          element={<PrivateRoute adminOnly><ReportsPage /></PrivateRoute>} />
        <Route path="members"          element={<PrivateRoute managerOnly><MembersPage /></PrivateRoute>} />
        <Route path="merch-mgmt"       element={<PrivateRoute managerOnly><MerchMgmtPage /></PrivateRoute>} />
        <Route path="settings"         element={<PrivateRoute managerOnly><SettingsPage /></PrivateRoute>} />
        <Route path="menu-mgmt"        element={<PrivateRoute managerOnly><MenuMgmtPage /></PrivateRoute>} />
        <Route path="tables-mgmt"      element={<PrivateRoute managerOnly><TablesMgmtPage /></PrivateRoute>} />
        <Route path="recipes"          element={<PrivateRoute managerOnly><RecipesMgmtPage /></PrivateRoute>} />
        <Route path="invoices"         element={<PrivateRoute managerOnly><InvoicesPage /></PrivateRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (<AuthProvider><AppRoutes /></AuthProvider>);
}
