import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../utils/api';
import { setToken, setUser, isAuthenticated } from '../utils/auth';

const Login = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated()) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let response;
      if (isLogin) {
        response = await authAPI.login({
          email: formData.email,
          password: formData.password,
        });
      } else {
        response = await authAPI.register({
          email: formData.email,
          password: formData.password,
          name: formData.name,
        });
      }

      const { token, user } = response.data;
      setToken(token);
      setUser(user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-pink-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <span className="text-white font-bold text-3xl">R</span>
          </div>
          <h2 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            ReplyFlow
          </h2>
          <p className="mt-2 text-gray-500">
            Instagram Auto-DM Automation Tool
          </p>
        </div>

        {/* Meta Verified Badge */}
        <div className="bg-gradient-to-b from-gray-100 to-white rounded-2xl p-6 text-center border border-gray-200">
          <div className="flex items-center justify-center gap-2 mb-2">
            {/* Meta Logo - Infinity Symbol */}
            <svg className="w-8 h-8" viewBox="0 0 100 100" fill="none">
              <defs>
                <linearGradient id="metaGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#0668E1" />
                  <stop offset="50%" stopColor="#0080FB" />
                  <stop offset="100%" stopColor="#00C2FF" />
                </linearGradient>
              </defs>
              <path
                d="M28.5 25C18 25 10 35 10 50C10 65 18 75 28.5 75C35 75 40 71 50 55C60 71 65 75 71.5 75C82 75 90 65 90 50C90 35 82 25 71.5 25C65 25 60 29 50 45C40 29 35 25 28.5 25ZM28.5 35C33 35 37 39 45 52L50 60L55 52C63 39 67 35 71.5 35C76 35 80 41 80 50C80 59 76 65 71.5 65C67 65 63 61 55 48L50 40L45 48C37 61 33 65 28.5 65C24 65 20 59 20 50C20 41 24 35 28.5 35Z"
                fill="url(#metaGradient)"
              />
            </svg>
            <h3 className="text-lg font-semibold text-gray-800">We're a Meta-verified business</h3>
          </div>
          <p className="text-sm text-gray-500">
            We only use official Instagram APIs and processes.<br />
            Your Instagram account is secure, and you stay in full control.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required={!isLogin}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  placeholder="Your name"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            {/* Terms and Privacy */}
            {!isLogin && (
              <p className="text-center text-sm text-gray-500">
                By signing up you agree to the{' '}
                <a href="#" className="text-purple-600 hover:underline">Terms</a>
                {' '}and{' '}
                <a href="#" className="text-purple-600 hover:underline">Privacy Policy</a>
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50"
            >
              {loading ? 'Please wait...' : isLogin ? 'Login' : 'Create Account'}
            </button>
          </form>
        </div>

        </div>
    </div>
  );
};

export default Login;
