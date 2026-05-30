import { Routes, Route, Navigate } from "react-router-dom";
import { useRideAuth } from "./auth/RideAuthContext.jsx";
import Layout from "./components/Layout.jsx";
import BoardPage from "./pages/BoardPage.jsx";
import RideDetailPage from "./pages/RideDetailPage.jsx";
import CreateRidePage from "./pages/CreateRidePage.jsx";
import MyRidesPage from "./pages/MyRidesPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";

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
        <Route path="/" element={<BoardPage />} />
        <Route path="/ride/:id" element={<RideDetailPage />} />
        <Route path="/new" element={<RequireAuth><CreateRidePage /></RequireAuth>} />
        <Route path="/me" element={<RequireAuth><MyRidesPage /></RequireAuth>} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
