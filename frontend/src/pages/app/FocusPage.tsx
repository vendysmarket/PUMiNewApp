// FocusPage — redirect to FocusRoom
import { Navigate } from "react-router-dom";

export default function FocusPage() {
  return <Navigate to="/app/focusroom" replace />;
}
