import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import ChatPageLegacy from "./pages/app/ChatPageLegacy";
import NewChatPage from "./pages/app/NewChatPage";
import FocusPage from "./pages/app/FocusPage";
import FilesPage from "./pages/app/FilesPage";
import ProfilePage from "./pages/app/ProfilePage";
import SettingsPage from "./pages/app/SettingsPage";
import SubscriptionPage from "./pages/app/SubscriptionPage";
import CheckoutSuccessPage from "./pages/app/CheckoutSuccessPage";
import TestLazyLoad from "./pages/app/TestLazyLoad";
import NotFound from "./pages/NotFound";
import { RequirePaid } from "./components/auth/RequirePaid";
import { RequireAuth } from "./components/auth/RequireAuth";
import SignupPage from "./pages/SignupPage";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public teaser landing */}
          <Route path="/home" element={<HomePage />} />
          
          {/* Public auth routes */}
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<LoginPage />} />
          
          {/* Redirect root to /home */}
          <Route path="/" element={<Navigate to="/home" replace />} />
          
          {/* App routes - require authentication */}
          <Route element={<RequireAuth />}>
            <Route path="/app" element={<AppLayout />}>
              <Route index element={<Navigate to="/app/chat" replace />} />
              <Route path="chat" element={<NewChatPage />} />
              <Route path="chat-legacy" element={<ChatPageLegacy />} />
              
              {/* Protected route - requires paid tier */}
              <Route element={<RequirePaid />}>
                <Route path="focus" element={<FocusPage />} />
              </Route>
              
              <Route path="files" element={<FilesPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="subscription" element={<SubscriptionPage />} />
              <Route path="checkout-success" element={<CheckoutSuccessPage />} />
              <Route path="test-lazy" element={<TestLazyLoad />} />
            </Route>
          </Route>
          
          {/* Catch-all for 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
