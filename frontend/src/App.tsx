import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { WorkspaceProvider } from "./state/Workspace";

const Landing = lazy(() => import("./pages/Landing"));
const WorkspaceLayout = lazy(() => import("./pages/WorkspaceLayout"));
const Overview = lazy(() => import("./pages/Overview"));
const DataWorkspace = lazy(() => import("./pages/DataWorkspace"));
const Profiling = lazy(() => import("./pages/Profiling"));
const FeatureLab = lazy(() => import("./pages/FeatureLab"));
const SegmentationLab = lazy(() => import("./pages/SegmentationLab"));
const Explorer = lazy(() => import("./pages/Explorer"));
const PersonaStudio = lazy(() => import("./pages/PersonaStudio"));
const Insights = lazy(() => import("./pages/Insights"));
const Reports = lazy(() => import("./pages/Reports"));

const Loading = () => <div style={{ padding: 40 }}><div className="skeleton" style={{ height: 240 }} /></div>;

export default function App() {
  return (
    <WorkspaceProvider>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<WorkspaceLayout />}>
            <Route index element={<Overview />} />
            <Route path="data" element={<DataWorkspace />} />
            <Route path="profile" element={<Profiling />} />
            <Route path="features" element={<FeatureLab />} />
            <Route path="segmentation" element={<SegmentationLab />} />
            <Route path="explorer" element={<Explorer />} />
            <Route path="personas" element={<PersonaStudio />} />
            <Route path="insights" element={<Insights />} />
            <Route path="reports" element={<Reports />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </WorkspaceProvider>
  );
}
