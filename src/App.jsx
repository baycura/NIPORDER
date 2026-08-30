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
import StockCountPage from "./pages/manager/StockCountPage.jsx";
import StaffMgmtPage from "./pages/manager/StaffMgmtPage.jsx";
import HappyHourPage from "./pages/manager/HappyHourPage.jsx";
import CategorySchedulePage from "./pages/manager/CategorySchedulePage.jsx";
import QRCodesPage from "./pages/manager/QRCodesPage.jsx";
import ReportsPage from "./pages/manager/ReportsPage.jsx";
import ProfitPage from "./pages/manager/ProfitPage.jsx";
import CostsPage from "./pages/manager/CostsPage.jsx";
import CashCountPage from "./pages/staff/CashCountPage.jsx";
import CashCountsPage from "./pages/manager/CashCountsPage.jsx";
import SettlementPage from "./pages/manager/SettlementPage.jsx";
import MembersPage from "./pages/manager/MembersPage.jsx";
import MerchMgmtPage from "./pages/manager/MerchMgmtPage.jsx";
import SettingsPage from "./pages/manager/SettingsPage.jsx";
import MenuMgmtPage from "./pages/manager/MenuMgmtPage.jsx";
import PartyMenuPage from "./pages/manager/PartyMenuPage.jsx";
import TasksPage from "./pages/manager/TasksPage.jsx";
import ContentPage from "./pages/manager/ContentPage.jsx";
import PollsPage from "./pages/manager/PollsPage.jsx";
import TablesMgmtPage from "./pages/manager/TablesMgmtPage.jsx";
import RecipesMgmtPage from "./pages/manager/RecipesMgmtPage.jsx";
import InvoicesPage from "./pages/manager/InvoicesPage.jsx";
import ExpensesPage from "./pages/staff/ExpensesPage.jsx";
import RetailPage from "./pages/manager/RetailPage.jsx";
import FixedExpensesPage from "./pages/manager/FixedExpensesPage.jsx";
import HubPage from "./pages/staff/HubPage.jsx";
import TodayPage from "./pages/manager/TodayPage.jsx";
import ShiftsOverviewPage from "./pages/manager/ShiftsOverviewPage.jsx";

function PrivateRoute({ children, managerOnly = false, adminOnly = false, allowViewer = false, deny = [] }) {
  const { session, staffUser, isManager, isAdmin, isViewer, loading } = useAuth();
  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#fff"}}>
      <img src="/icons/logo-mark.png" alt="" className="nip-splash-mark" style={{width:110,height:"auto"}}/>
    </div>
  );
  if (!session || !staffUser) return (<Navigate to="/login" replace />);
  const home = isViewer ? "/reports" : "/tables";
  if (adminOnly && !isAdmin && !(allowViewer && isViewer)) return (<Navigate to={home} replace />);
  if (managerOnly && !isManager) return (<Navigate to={home} replace />);
  if (deny.includes(staffUser.role)) return (<Navigate to={home} replace />);
  return children;
}

function AppRoutes() {
  const { session, staffUser, isKitchen, isCashier, isViewer, isManager } = useAuth();
  // Yonetici/sahip girince "Bugun"e duser; digerleri eski aliskanliginda
  const defaultRoute = isViewer ? "/reports" : isManager ? "/today" : isKitchen ? "/kitchen" : isCashier ? "/payment" : "/tables";
  return (
    <Routes>
      <Route path="/login" element={session && staffUser ? (<Navigate to={defaultRoute} replace />) : (<LoginPage />)}/>
      <Route path="/menu/:qrToken" element={<CustomerMenu />} />
      <Route path="/menu" element={<CustomerMenu />} />
      <Route path="/kitchen-display" element={<PrivateRoute><KitchenDisplayPage /></PrivateRoute>} />
      <Route path="/" element={<PrivateRoute><StaffLayout /></PrivateRoute>}>
        <Route index element={<Navigate to={defaultRoute} replace />} />
        <Route path="tables"           element={<PrivateRoute deny={["viewer"]}><TablesPage /></PrivateRoute>} />
        <Route path="orders"           element={<PrivateRoute deny={["viewer"]}><OrdersPage /></PrivateRoute>} />
        <Route path="orders/:orderId"  element={<PrivateRoute deny={["viewer"]}><OrderDetailPage /></PrivateRoute>} />
        <Route path="kitchen"          element={<PrivateRoute deny={["viewer","parttime"]}><KitchenPage /></PrivateRoute>} />
        <Route path="payment"          element={<PrivateRoute deny={["viewer"]}><PaymentPage /></PrivateRoute>} />
        <Route path="cash-count"       element={<PrivateRoute deny={["viewer","kitchen"]}><CashCountPage /></PrivateRoute>} />
        <Route path="cash-history"     element={<PrivateRoute managerOnly><CashCountsPage /></PrivateRoute>} />
        <Route path="stock"            element={<PrivateRoute deny={["parttime"]}><StockViewPage /></PrivateRoute>} />
        <Route path="myshift"          element={<PrivateRoute deny={["viewer","parttime"]}><MyShiftPage /></PrivateRoute>} />
        <Route path="stock-mgmt"       element={<PrivateRoute managerOnly><StockMgmtPage /></PrivateRoute>} />
        {/* Sayim yoneticiye kilitli DEGIL: rafi fiilen sayan bar personeli.
            Kapi nip_stok_sayimi_kaydet icinde de var (kitchen/viewer/parttime). */}
        <Route path="stock-count"      element={<PrivateRoute deny={["viewer","kitchen","parttime"]}><StockCountPage /></PrivateRoute>} />
        <Route path="staff-mgmt"       element={<PrivateRoute adminOnly><StaffMgmtPage /></PrivateRoute>} />
        <Route path="happy-hour"       element={<PrivateRoute managerOnly><HappyHourPage /></PrivateRoute>} />
        <Route path="category-schedule" element={<PrivateRoute managerOnly><CategorySchedulePage /></PrivateRoute>} />
        <Route path="qr-codes" element={<PrivateRoute managerOnly><QRCodesPage /></PrivateRoute>} />
        <Route path="tasks" element={<PrivateRoute deny={["viewer","parttime"]}><TasksPage /></PrivateRoute>} />
        <Route path="reports"          element={<PrivateRoute adminOnly allowViewer><ReportsPage /></PrivateRoute>} />
        <Route path="profit"           element={<PrivateRoute adminOnly><ProfitPage /></PrivateRoute>} />
        <Route path="costs"            element={<PrivateRoute managerOnly><CostsPage /></PrivateRoute>} />
          <Route path="settlement"       element={<PrivateRoute adminOnly allowViewer><SettlementPage /></PrivateRoute>} />
        <Route path="members"          element={<PrivateRoute managerOnly><MembersPage /></PrivateRoute>} />
        <Route path="merch-mgmt"       element={<PrivateRoute managerOnly><MerchMgmtPage /></PrivateRoute>} />
        <Route path="content"          element={<PrivateRoute managerOnly><ContentPage /></PrivateRoute>} />
        <Route path="polls"            element={<PrivateRoute managerOnly><PollsPage /></PrivateRoute>} />
        <Route path="settings"         element={<PrivateRoute managerOnly><SettingsPage /></PrivateRoute>} />
        <Route path="menu-mgmt"        element={<PrivateRoute managerOnly><MenuMgmtPage /></PrivateRoute>} />
        <Route path="party-menu"       element={<PrivateRoute managerOnly><PartyMenuPage /></PrivateRoute>} />
        <Route path="tables-mgmt"      element={<PrivateRoute managerOnly><TablesMgmtPage /></PrivateRoute>} />
        <Route path="recipes"          element={<PrivateRoute managerOnly><RecipesMgmtPage /></PrivateRoute>} />
        <Route path="fixed-expenses"   element={<PrivateRoute adminOnly><FixedExpensesPage /></PrivateRoute>} />
        <Route path="retail"           element={<PrivateRoute managerOnly><RetailPage /></PrivateRoute>} />
        <Route path="invoices"         element={<PrivateRoute deny={["viewer","parttime"]}><InvoicesPage /></PrivateRoute>} />
        <Route path="expenses"         element={<PrivateRoute><ExpensesPage /></PrivateRoute>} />
        <Route path="hub"              element={<PrivateRoute><HubPage /></PrivateRoute>} />
        <Route path="today"            element={<PrivateRoute managerOnly><TodayPage /></PrivateRoute>} />
        <Route path="shifts"           element={<PrivateRoute adminOnly><ShiftsOverviewPage /></PrivateRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (<AuthProvider><AppRoutes /></AuthProvider>);
}
