import { Navigate, Route, Routes } from "react-router";
import HomePage from "./HomePage";

// 页面只负责组装；新增页面在此登记路由
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
