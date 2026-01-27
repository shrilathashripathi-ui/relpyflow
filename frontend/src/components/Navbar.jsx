import { Link, useNavigate } from 'react-router-dom';
import { removeToken, getUser } from '../utils/auth';

const Navbar = () => {
  const navigate = useNavigate();
  const user = getUser();

  const handleLogout = () => {
    removeToken();
    navigate('/login');
  };

  return (
    <nav className="bg-slate-900 border-b border-slate-800 shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <Link to="/dashboard" className="flex items-center space-x-2">
            <div className="w-8 h-8 gradient-bg rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">R</span>
            </div>
            <span className="text-xl font-bold gradient-text">ReplyFlow</span>
          </Link>

          <div className="flex items-center space-x-6">
            <Link
              to="/dashboard"
              className="text-slate-300 hover:text-white transition-colors"
            >
              Dashboard
            </Link>
            <Link
              to="/connect-instagram"
              className="text-slate-300 hover:text-white transition-colors"
            >
              Connect Instagram
            </Link>
            <Link
              to="/automations"
              className="text-slate-300 hover:text-white transition-colors"
            >
              Automations
            </Link>
            <Link
              to="/create-automation"
              className="text-slate-300 hover:text-white transition-colors"
            >
              Create Automation
            </Link>

            <div className="flex items-center space-x-4 ml-4 pl-4 border-l border-slate-700">
              <span className="text-slate-400 text-sm">
                {user?.name || user?.email}
              </span>
              <button
                onClick={handleLogout}
                className="text-sm text-slate-300 hover:text-white bg-slate-800 px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors"
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
