import { Routes, Route, Navigate } from "react-router-dom";
import { useRideAuth } from "./auth/RideAuthContext.jsx";
import Layout from "./components/Layout.jsx";
import BoardPage from "./pages/BoardPage.jsx";
import RideDetailPage from "./pages/RideDetailPage.jsx";
import CreateRidePage from "./pages/CreateRidePage.jsx";
import CampsPage from "./pages/CampsPage.jsx";
import CampDetailPage from "./pages/CampDetailPage.jsx";
import RentalsPage from "./pages/RentalsPage.jsx";
import RentalDetailPage from "./pages/RentalDetailPage.jsx";
import CreateRentalPage from "./pages/CreateRentalPage.jsx";
import MyRidesPage from "./pages/MyRidesPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import AdminPage from "./admin/AdminPage.jsx";

function RequireAuth({ children }) {
  const { session, loading } = useRideAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

export default function RideApp() {
  return (
    <Layout>
      <Routes>
        {/* Ride Buddy */}
        <Route path="/" element={<BoardPage />} />
        <Route path="/ride/:id" element={<RideDetailPage />} />
        <Route path="/new" element={<RequireAuth><CreateRidePage /></RequireAuth>} />

        {/* Camps */}
        <Route path="/camps" element={<CampsPage />} />
        <Route path="/camps/:id" element={<CampDetailPage />} />

        {/* Rent from Local */}
        <Route path="/rentals" element={<RentalsPage />} />
        <Route path="/rentals/new" element={<RequireAuth><CreateRentalPage /></RequireAuth>} />
        <Route path="/rentals/:id" element={<RentalDetailPage />} />

        {/* Shared admin (staff-gated). Portable to reservation/#admin. */}
        <Route path="/admin" element={<AdminPage />} />

        {/* Account + auth */}
        <Route path="/me" element={<RequireAuth><MyRidesPage /></RequireAuth>} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
