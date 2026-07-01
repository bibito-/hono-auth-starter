import "./App.css";
import Header from "@client/components/layout/Header";
import AppRoutes from "@client/routes/AppRoutes";
import { Toaster } from "sonner";

export default function App() {
  return (
    <>
      <Header />
      <AppRoutes />
      <Toaster />
    </>
  );
}
