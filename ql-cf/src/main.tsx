import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./shared/context/AuthContext";
import { BrandThemeLoader } from "./shared/components/BrandThemeLoader";
import { AppErrorBoundary } from "./shared/components/AppErrorBoundary";
import { ThemeProvider } from "./shared/context/ThemeContext";
import { FormValidationFeedback } from "./shared/components/FormValidationFeedback";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <BrandThemeLoader>
              <FormValidationFeedback />
              <App />
            </BrandThemeLoader>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </AppErrorBoundary>
  </StrictMode>
);