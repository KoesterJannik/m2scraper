import type { Route } from "./+types/dashboard";
import { AuthGuard } from "../components/AuthGuard";
import { DashboardNavbar } from "../components/DashboardNavbar";
import { useUser } from "../hooks/useUser";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Dashboard" },
    { name: "description", content: "User Dashboard" },
  ];
}

export default function Dashboard() {
  const { data: user, isLoading, error } = useUser();

  if (isLoading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-gray-50">
          <DashboardNavbar />
          <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
            <div className="text-lg">Loading user data...</div>
          </div>
        </div>
      </AuthGuard>
    );
  }

  if (error) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-gray-50">
          <DashboardNavbar />
          <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
              <h2 className="text-xl font-semibold text-red-800 mb-2">Error</h2>
              <p className="text-red-600">
                {error instanceof Error ? error.message : "Failed to load user data"}
              </p>
            </div>
          </div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <DashboardNavbar />
        <div className="py-8">
          <div className="max-w-4xl mx-auto px-4">
            <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">User Data from API</h2>
              <pre className="bg-gray-100 p-4 rounded-lg overflow-auto text-sm">
                {JSON.stringify(user, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}