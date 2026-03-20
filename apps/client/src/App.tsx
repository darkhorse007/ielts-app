import { useMemo, type ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { ApiClient } from "./lib/api-client";
import { resolveRuntimeConfig } from "./lib/runtime-config";
import { TokenStorage } from "./lib/token-storage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { HomePage } from "./pages/HomePage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { ProgressPage } from "./pages/ProgressPage";
import { AccountPage } from "./pages/AccountPage";
import { DiagnosticPage } from "./pages/DiagnosticPage";
import { StudyPlanPage } from "./pages/StudyPlanPage";
import { ListeningPracticePage } from "./pages/ListeningPracticePage";
import { ReadingPracticePage } from "./pages/ReadingPracticePage";
import { SpeakingRealtimePage } from "./pages/SpeakingRealtimePage";
import { WritingEvaluationPage } from "./pages/WritingEvaluationPage";
import { MockExamPage } from "./pages/MockExamPage";
import { SubscriptionPage } from "./pages/SubscriptionPage";
import { AdminConsolePage } from "./pages/AdminConsolePage";
import { ObservabilityPage } from "./pages/ObservabilityPage";
import { SystemRoleAdminPage } from "./pages/SystemRoleAdminPage";
import { StabilityOpsPage } from "./pages/StabilityOpsPage";

const AuthenticatedRoute = ({ children }: { children: ReactElement }) => {
  const tokenStorage = useMemo(() => new TokenStorage(), []);
  if (!tokenStorage.hasSession()) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const LoginRoute = ({ apiClient, tokenStorage }: { apiClient: ApiClient; tokenStorage: TokenStorage }) => {
  const navigate = useNavigate();

  return (
    <LoginPage
      apiClient={apiClient}
      tokenStorage={tokenStorage}
      onLoginSuccess={() => {
        navigate("/home", { replace: true });
      }}
    />
  );
};

const RegisterRoute = ({ apiClient }: { apiClient: ApiClient }) => {
  const navigate = useNavigate();

  return (
    <RegisterPage
      apiClient={apiClient}
      onRegistered={() => {
        navigate("/login", { replace: true });
      }}
    />
  );
};

const OnboardingRoute = ({ apiClient, tokenStorage }: { apiClient: ApiClient; tokenStorage: TokenStorage }) => {
  return <OnboardingPage apiClient={apiClient} tokenStorage={tokenStorage} />;
};

const ProgressRoute = ({ apiClient, tokenStorage }: { apiClient: ApiClient; tokenStorage: TokenStorage }) => {
  return <ProgressPage apiClient={apiClient} tokenStorage={tokenStorage} />;
};

const AccountRoute = ({ apiClient, tokenStorage }: { apiClient: ApiClient; tokenStorage: TokenStorage }) => {
  return <AccountPage apiClient={apiClient} tokenStorage={tokenStorage} />;
};

const DiagnosticRoute = ({ apiClient, tokenStorage }: { apiClient: ApiClient; tokenStorage: TokenStorage }) => {
  return <DiagnosticPage apiClient={apiClient} tokenStorage={tokenStorage} />;
};

const StudyPlanRoute = ({ apiClient, tokenStorage }: { apiClient: ApiClient; tokenStorage: TokenStorage }) => {
  return <StudyPlanPage apiClient={apiClient} tokenStorage={tokenStorage} />;
};

const ListeningPracticeRoute = ({ apiClient, tokenStorage }: { apiClient: ApiClient; tokenStorage: TokenStorage }) => {
  return <ListeningPracticePage apiClient={apiClient} tokenStorage={tokenStorage} />;
};

const ReadingPracticeRoute = ({ apiClient, tokenStorage }: { apiClient: ApiClient; tokenStorage: TokenStorage }) => {
  return <ReadingPracticePage apiClient={apiClient} tokenStorage={tokenStorage} />;
};

const SpeakingRealtimeRoute = ({
  apiClient,
  tokenStorage,
  wsBaseUrl
}: {
  apiClient: ApiClient;
  tokenStorage: TokenStorage;
  wsBaseUrl: string;
}) => {
  return <SpeakingRealtimePage apiClient={apiClient} tokenStorage={tokenStorage} wsBaseUrl={wsBaseUrl} />;
};

const WritingRoute = ({ apiClient, tokenStorage }: { apiClient: ApiClient; tokenStorage: TokenStorage }) => {
  return <WritingEvaluationPage apiClient={apiClient} tokenStorage={tokenStorage} />;
};

const MockExamRoute = ({ apiClient, tokenStorage }: { apiClient: ApiClient; tokenStorage: TokenStorage }) => {
  return <MockExamPage apiClient={apiClient} tokenStorage={tokenStorage} />;
};

const SubscriptionRoute = ({ apiClient, tokenStorage }: { apiClient: ApiClient; tokenStorage: TokenStorage }) => {
  return <SubscriptionPage apiClient={apiClient} tokenStorage={tokenStorage} />;
};

const AdminRoute = ({ apiClient }: { apiClient: ApiClient }) => {
  return <AdminConsolePage apiClient={apiClient} />;
};

const ObservabilityRoute = ({ apiClient, tokenStorage }: { apiClient: ApiClient; tokenStorage: TokenStorage }) => {
  return <ObservabilityPage apiClient={apiClient} tokenStorage={tokenStorage} />;
};

const SystemRoleAdminRoute = ({ apiClient, tokenStorage }: { apiClient: ApiClient; tokenStorage: TokenStorage }) => {
  return <SystemRoleAdminPage apiClient={apiClient} tokenStorage={tokenStorage} />;
};

const StabilityOpsRoute = ({ apiClient, tokenStorage }: { apiClient: ApiClient; tokenStorage: TokenStorage }) => {
  return <StabilityOpsPage apiClient={apiClient} tokenStorage={tokenStorage} />;
};

export const App = () => {
  const runtimeConfig = useMemo(() => resolveRuntimeConfig(import.meta.env), []);
  const apiClient = useMemo(() => new ApiClient(runtimeConfig.apiBaseUrl), [runtimeConfig.apiBaseUrl]);
  const tokenStorage = useMemo(() => new TokenStorage(), []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/register" element={<RegisterRoute apiClient={apiClient} />} />
        <Route path="/login" element={<LoginRoute apiClient={apiClient} tokenStorage={tokenStorage} />} />
        <Route
          path="/home"
          element={
            <AuthenticatedRoute>
              <HomePage />
            </AuthenticatedRoute>
          }
        />
        <Route
          path="/onboarding"
          element={
            <AuthenticatedRoute>
              <OnboardingRoute apiClient={apiClient} tokenStorage={tokenStorage} />
            </AuthenticatedRoute>
          }
        />
        <Route
          path="/progress"
          element={
            <AuthenticatedRoute>
              <ProgressRoute apiClient={apiClient} tokenStorage={tokenStorage} />
            </AuthenticatedRoute>
          }
        />
        <Route
          path="/diagnostic"
          element={
            <AuthenticatedRoute>
              <DiagnosticRoute apiClient={apiClient} tokenStorage={tokenStorage} />
            </AuthenticatedRoute>
          }
        />
        <Route
          path="/plan"
          element={
            <AuthenticatedRoute>
              <StudyPlanRoute apiClient={apiClient} tokenStorage={tokenStorage} />
            </AuthenticatedRoute>
          }
        />
        <Route
          path="/account"
          element={
            <AuthenticatedRoute>
              <AccountRoute apiClient={apiClient} tokenStorage={tokenStorage} />
            </AuthenticatedRoute>
          }
        />
        <Route
          path="/practice/listening"
          element={
            <AuthenticatedRoute>
              <ListeningPracticeRoute apiClient={apiClient} tokenStorage={tokenStorage} />
            </AuthenticatedRoute>
          }
        />
        <Route
          path="/practice/reading"
          element={
            <AuthenticatedRoute>
              <ReadingPracticeRoute apiClient={apiClient} tokenStorage={tokenStorage} />
            </AuthenticatedRoute>
          }
        />
        <Route
          path="/speaking-live"
          element={
            <AuthenticatedRoute>
              <SpeakingRealtimeRoute
                apiClient={apiClient}
                tokenStorage={tokenStorage}
                wsBaseUrl={runtimeConfig.wsBaseUrl}
              />
            </AuthenticatedRoute>
          }
        />
        <Route
          path="/writing"
          element={
            <AuthenticatedRoute>
              <WritingRoute apiClient={apiClient} tokenStorage={tokenStorage} />
            </AuthenticatedRoute>
          }
        />
        <Route
          path="/mock-exam"
          element={
            <AuthenticatedRoute>
              <MockExamRoute apiClient={apiClient} tokenStorage={tokenStorage} />
            </AuthenticatedRoute>
          }
        />
        <Route
          path="/subscription"
          element={
            <AuthenticatedRoute>
              <SubscriptionRoute apiClient={apiClient} tokenStorage={tokenStorage} />
            </AuthenticatedRoute>
          }
        />
        <Route
          path="/observability"
          element={
            <AuthenticatedRoute>
              <ObservabilityRoute apiClient={apiClient} tokenStorage={tokenStorage} />
            </AuthenticatedRoute>
          }
        />
        <Route
          path="/system-roles"
          element={
            <AuthenticatedRoute>
              <SystemRoleAdminRoute apiClient={apiClient} tokenStorage={tokenStorage} />
            </AuthenticatedRoute>
          }
        />
        <Route
          path="/stability"
          element={
            <AuthenticatedRoute>
              <StabilityOpsRoute apiClient={apiClient} tokenStorage={tokenStorage} />
            </AuthenticatedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <AuthenticatedRoute>
              <AdminRoute apiClient={apiClient} />
            </AuthenticatedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
