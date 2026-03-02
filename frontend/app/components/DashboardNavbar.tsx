import { Link, useNavigate } from "react-router";
import { authClient } from "../lib/auth";

export function DashboardNavbar() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          navigate("/");
        },
      },
    });
  };

  return (
    <nav className="bg-white shadow-md border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-6">
            <Link to="/dashboard" className="text-xl font-bold text-gray-900 hover:text-gray-700">
              M2 Scraper
            </Link>
            <div className="hidden md:flex items-center gap-4">
              <Link
                to="/dashboard"
                className="text-gray-700 hover:text-gray-900 font-medium transition-colors"
              >
                Dashboard
              </Link>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {isPending ? (
              <div className="text-gray-500">Loading...</div>
            ) : session ? (
              <>
                <div className="flex items-center gap-3">
                  {session.user?.image && (
                    <img
                      src={session.user.image}
                      alt={session.user.name || "User"}
                      className="w-8 h-8 rounded-full"
                    />
                  )}
                  <div className="hidden sm:block">
                    <div className="text-sm font-medium text-gray-900">
                      {session.user?.name || "User"}
                    </div>
                    {session.user?.email && (
                      <div className="text-xs text-gray-500">
                        {session.user.email}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors duration-200"
                >
                  Logout
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </nav>
  );
}
