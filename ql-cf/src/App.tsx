import { AppRoutes } from "./routes/AppRoutes";
import { FeedbackProvider } from "./shared/components/FeedbackProvider";

function App() {
  return (
    <FeedbackProvider>
      <AppRoutes />
    </FeedbackProvider>
  );
}

export default App
