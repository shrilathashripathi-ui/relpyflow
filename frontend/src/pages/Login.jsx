import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { authAPI } from '../utils/api';
import { setToken, setUser, isAuthenticated } from '../utils/auth';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLogin, setIsLogin] = useState(location.pathname !== '/register');
  const [showOTP, setShowOTP] = useState(false);
  const [otpEmail, setOtpEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    phone: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated()) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  // Countdown timer for resend
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

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
    setSuccess('');
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
          phone: formData.phone,
        });
      }

      const data = response.data;

      // If verification required, show OTP screen
      if (data.requiresVerification) {
        setOtpEmail(data.email || formData.email);
        setShowOTP(true);
        setResendTimer(30);
        setSuccess(data.message || 'OTP sent to your email');
        return;
      }

      // Normal login success
      const { token, user } = data;
      setToken(token);
      setUser(user);
      navigate('/dashboard');
    } catch (err) {
      const data = err.response?.data;
      // 403 = email not verified, show OTP screen
      if (err.response?.status === 403 && data?.requiresVerification) {
        setOtpEmail(data.email || formData.email);
        setShowOTP(true);
        setResendTimer(30);
        setSuccess(data.message || 'OTP sent to your email');
        return;
      }
      setError(data?.error || data?.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await authAPI.verifyOTP({ email: otpEmail, otp });
      const { token, user } = response.data;
      setToken(token);
      setUser(user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendTimer > 0) return;
    setError('');
    setSuccess('');

    try {
      await authAPI.resendOTP({ email: otpEmail });
      setResendTimer(30);
      setSuccess('A new OTP has been sent to your email');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resend OTP');
    }
  };

  // OTP Verification Screen
  if (showOTP) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h2 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Verify Email
            </h2>
            <p className="mt-2 text-gray-500 dark:text-gray-400">
              Enter the 6-digit code sent to <strong className="text-gray-700 dark:text-gray-200">{otpEmail}</strong>
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
            <form onSubmit={handleVerifyOTP} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Verification Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '')); setError(''); }}
                  required
                  autoFocus
                  className="w-full px-4 py-4 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-center text-2xl tracking-widest font-bold dark:bg-gray-700 dark:text-white"
                  placeholder="000000"
                />
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}

              {success && (
                <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-xl text-sm">
                  {success}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50"
              >
                {loading ? 'Verifying...' : 'Verify Email'}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={handleResendOTP}
                disabled={resendTimer > 0}
                className="text-sm text-purple-600 dark:text-purple-400 hover:underline disabled:text-gray-400 disabled:no-underline"
              >
                {resendTimer > 0 ? `Resend OTP in ${resendTimer}s` : 'Resend OTP'}
              </button>
            </div>

            <div className="mt-2 text-center">
              <button
                onClick={() => { setShowOTP(false); setOtp(''); setError(''); setSuccess(''); }}
                className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
              >
                Back to {isLogin ? 'login' : 'signup'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Replyflows
          </h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Instagram DM Automation Platform
          </p>
        </div>

        {/* Meta Verified Badge */}
        <div className="bg-gradient-to-b from-gray-100 to-white dark:from-gray-800 dark:to-gray-800 rounded-2xl p-6 text-center border border-gray-200 dark:border-gray-700">
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
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">We're a Meta-verified business</h3>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            We only use official Instagram APIs and processes.<br />
            Your Instagram account is secure, and you stay in full control.
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required={!isLogin}
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                  placeholder="Your name"
                />
              </div>
            )}

            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                  placeholder="+91 9876543210"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Password
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            {/* Terms and Privacy */}
            {!isLogin && (
              <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                By signing up you agree to the{' '}
                <a href="https://api.replyflows.in/terms" target="_blank" rel="noopener noreferrer" className="text-purple-600 dark:text-purple-400 hover:underline">Terms</a>
                {' '}and{' '}
                <a href="https://api.replyflows.in/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-purple-600 dark:text-purple-400 hover:underline">Privacy Policy</a>
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

        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          {isLogin ? (
            <>
              Don't have an account?{' '}
              <Link to="/register" onClick={() => { setIsLogin(false); setError(''); }} className="text-purple-600 dark:text-purple-400 hover:underline font-medium">
                Sign up
              </Link>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <Link to="/login" onClick={() => { setIsLogin(true); setError(''); }} className="text-purple-600 dark:text-purple-400 hover:underline font-medium">
                Log in
              </Link>
            </>
          )}
        </p>

        </div>
    </div>
  );
};

export default Login;
