import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "@/components/Layout";
import RecorderPage from "@/pages/RecorderPage";
import LectureListPage from "@/pages/LectureListPage";
import LectureViewPage from "@/pages/LectureViewPage";
import SettingsPage from "@/pages/SettingsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<RecorderPage />} />
          <Route path="lectures" element={<LectureListPage />} />
          <Route path="lectures/:id" element={<LectureViewPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
