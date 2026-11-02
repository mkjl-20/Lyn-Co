import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./shared/context/AuthContext";
import { BrandThemeLoader } from "./shared/components/BrandThemeLoader";
import { AppErrorBoundary } from "./shared/components/AppErrorBoundary";
import { ThemeProvider } from "./shared/context/ThemeContext";
import { FormValidationFeedback } from "./shared/components/FormValidationFeedback";
import { AppRoutes } from "./routes/AppRoutes";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <BrandThemeLoader>
              <FormValidationFeedback />
              <AppRoutes />
            </BrandThemeLoader>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </AppErrorBoundary>
  </StrictMode>
);