import { Link, useNavigate, useLocation } from 'react-router-dom';
import { removeToken, getUser } from '../utils/auth';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();

  const handleLogout = () => {
    removeToken();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <Link to="/dashboard" className="flex items-center">
            <span className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
              Replyflows
            </span>
          </Link>

          <div className="flex items-center space-x-1">
            <Link
              to="/dashboard"
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isActive('/dashboard')
                  ? 'bg-purple-100 text-purple-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Dashboard
            </Link>
            <Link
              to="/connect-instagram"
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isActive('/connect-instagram')
                  ? 'bg-purple-100 text-purple-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Connect
            </Link>
            <Link
              to="/automations"
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isActive('/automations')
                  ? 'bg-purple-100 text-purple-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Automations
            </Link>
            <Link
              to="/create-automation"
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isActive('/create-automation')
                  ? 'bg-purple-100 text-purple-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              + Create
            </Link>

            <div className="flex items-center space-x-3 ml-4 pl-4 border-l border-gray-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white text-sm font-bold">
                  {(user?.name || user?.email)?.charAt(0).toUpperCase()}
                </div>
                <span className="text-gray-600 text-sm font-medium">
                  {user?.name || user?.email?.split('@')[0]}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
