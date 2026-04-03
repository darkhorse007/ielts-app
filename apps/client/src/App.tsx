import { useEffect, useMemo, useState, type ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { ApiClient } from "./lib/api-client";
import { resolveRuntimeConfig } from "./lib/runtime-config";
import { loadCachedSessionProfile } from "./lib/session-profile-cache";
import { TokenStorage } from "./lib/token-storage";
import { hasInternalOpsAccess } from "./lib/system-roles";
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
import { AdminMinorGuardianSupportPage } from "./pages/AdminMinorGuardianSupportPage";

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

const InternalOpsRoute = ({
  apiClient,
  tokenStorage,
  children
}: {
  apiClient: Pick<ApiClient, "getProfile">;
  tokenStorage: TokenStorage;
  children: ReactElement;
}) => {
  const [status, setStatus] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    let cancelled = false;

    const verifyAccess = async (): Promise<void> => {
      const accessToken = tokenStorage.getAccessToken();
      if (!accessToken) {
        if (!cancelled) {
          setStatus("denied");
        }
        return;
      }

      try {
        const profile = await loadCachedSessionProfile(apiClient, accessToken);
        if (!cancelled) {
          setStatus(hasInternalOpsAccess(profile.system_roles) ? "allowed" : "denied");
        }
      } catch {
        if (!cancelled) {
          setStatus("denied");
        }
      }
    };

    void verifyAccess();

    return () => {
      cancelled = true;
    };
  }, [apiClient, tokenStorage]);

  if (status === "checking") {
    return <p>正在校验内部权限...</p>;
  }

  if (status === "denied") {
    return <Navigate to="/home" replace />;
  }

  return children;
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

const HomeRoute = ({ apiClient, tokenStorage }: { apiClient: ApiClient; tokenStorage: TokenStorage }) => {
  return <HomePage apiClient={apiClient} tokenStorage={tokenStorage} />;
};

const AdminRoute = ({ apiClient, tokenStorage }: { apiClient: ApiClient; tokenStorage: TokenStorage }) => {
  return <AdminMinorGuardianSupportPage apiClient={apiClient} tokenStorage={tokenStorage} />;
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
              <HomeRoute apiClient={apiClient} tokenStorage={tokenStorage} />
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
        <Route path="/subscription" element={<Navigate to="/home" replace />} />
        <Route path="/observability" element={<Navigate to="/home" replace />} />
        <Route path="/system-roles" element={<Navigate to="/home" replace />} />
        <Route path="/stability" element={<Navigate to="/home" replace />} />
        <Route
          path="/admin"
          element={
            <AuthenticatedRoute>
              <InternalOpsRoute apiClient={apiClient} tokenStorage={tokenStorage}>
                <AdminRoute apiClient={apiClient} tokenStorage={tokenStorage} />
              </InternalOpsRoute>
            </AuthenticatedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
