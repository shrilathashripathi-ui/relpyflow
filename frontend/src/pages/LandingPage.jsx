import { useState } from 'react';

const APP_URL = 'https://app.replyflows.in';

const LandingPage = () => {
  const goTo = (path) => { window.location.href = `${APP_URL}${path}`; };
  const [openFaq, setOpenFaq] = useState(null);

  const features = [
    {
      title: 'Auto-DM from Comments',
      description: 'Someone comments a keyword on your Reel? They instantly get a personalized DM with your link, offer, or message.',
      demo: {
        type: 'comment-to-dm',
        comment: { user: '@priya_style', text: 'PRICE', avatar: 'P' },
        dm: { text: 'Hey Priya! Here\'s the pricing for our collection. Use code INSTA10 for 10% off!', link: 'shop.example.com/pricing' }
      }
    },
    {
      title: 'Keyword Triggers',
      description: 'Set custom keywords like "LINK", "INFO", or "BUY". Any comment containing your keyword triggers an instant DM.',
      demo: {
        type: 'keywords',
        keywords: ['PRICE', 'LINK', 'INFO', 'BUY', 'DETAILS'],
        matches: 247
      }
    },
    {
      title: 'Lead Capture in DMs',
      description: 'Collect emails, phone numbers, and custom data directly through DM conversations. Export to CSV anytime.',
      demo: {
        type: 'lead-capture',
        fields: ['Email', 'Phone', 'Name'],
        captured: 89
      }
    },
    {
      title: 'Smart Follow-ups',
      description: 'No reply? Auto-send a follow-up message after 24 hours. Bring back interested leads who forgot to respond.',
      demo: {
        type: 'followup',
        initial: 'Hey! Here\'s your link',
        followup: 'Just checking in - did you get a chance to look?',
        hours: 24
      }
    },
    {
      title: 'Analytics & Insights',
      description: 'Track DMs sent, reply rates, conversion events, and top-performing keywords. All in a clean dashboard.',
      demo: {
        type: 'analytics',
        stats: { sent: 1247, replied: 586, converted: 203 }
      }
    }
  ];

  const [activeFeature, setActiveFeature] = useState(0);

  const howItWorks = [
    {
      step: 1,
      title: 'Connect Your Instagram',
      description: 'Link your Instagram business account through official Meta APIs. Secure, verified, and takes 30 seconds.'
    },
    {
      step: 2,
      title: 'Set Keywords & Messages',
      description: 'Choose trigger keywords and write your DM. When someone comments your keyword, they get your message instantly.'
    },
    {
      step: 3,
      title: 'Watch Leads Roll In',
      description: 'Sit back while Replyflows auto-DMs commenters, captures leads, and follows up. Check your dashboard for results.'
    }
  ];

  const faqs = [
    {
      question: 'Will my Instagram account get blocked?',
      answer: 'No. Replyflows uses official Instagram APIs only - no scraping, no automation hacks. Your account is 100% safe.'
    },
    {
      question: 'Will the DMs sound robotic?',
      answer: 'Not at all. You write your own messages in your own voice. Add personalization variables like the commenter\'s name. Your followers won\'t know it\'s automated.'
    },
    {
      question: 'Do I need any coding knowledge?',
      answer: 'Zero coding needed. Connect your account, set a keyword, write a message - that\'s it. The entire setup takes under 2 minutes.'
    },
    {
      question: 'What\'s the difference between Free and Pro?',
      answer: 'Free gives you 1,000 DMs/month, 1,000 contacts, and keyword triggers. Pro at \u20b9500/month gives you unlimited DMs, unlimited keywords, priority support, and advanced analytics.'
    },
    {
      question: 'Can I cancel anytime?',
      answer: 'Yes, cancel anytime from your dashboard. No contracts, no hidden fees. Your account stays active until the end of your billing period.'
    }
  ];

  const renderFeatureDemo = (feature) => {
    const demo = feature.demo;
    switch (demo.type) {
      case 'comment-to-dm':
        return (
          <div className="bg-gray-900 rounded-2xl p-6 text-white h-full flex flex-col justify-center">
            <div className="mb-4">
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">Instagram Comment</p>
              <div className="bg-gray-800 rounded-xl p-4 flex items-start gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {demo.comment.avatar}
                </div>
                <div>
                  <p className="text-white font-medium text-sm">{demo.comment.user}</p>
                  <p className="text-gray-300 text-sm">{demo.comment.text}</p>
                </div>
              </div>
            </div>
            <div className="flex justify-center my-2">
              <svg className="w-6 h-6 text-purple-400 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">Auto DM Sent</p>
              <div className="bg-gradient-to-r from-purple-600/30 to-pink-600/30 border border-purple-500/30 rounded-xl p-4">
                <p className="text-white text-sm mb-2">{demo.dm.text}</p>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 rounded-lg text-xs font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  {demo.dm.link}
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="px-2.5 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-medium">Delivered</span>
              <span className="text-gray-500 text-xs">Just now</span>
            </div>
          </div>
        );
      case 'keywords':
        return (
          <div className="bg-gray-900 rounded-2xl p-6 text-white h-full flex flex-col justify-center">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-4">Active Keyword Triggers</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {demo.keywords.map((kw, i) => (
                <span key={i} className="px-4 py-2 bg-purple-600/30 border border-purple-500/40 rounded-xl text-purple-300 text-sm font-medium">
                  #{kw}
                </span>
              ))}
            </div>
            <div className="bg-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Comments matched today</p>
                  <p className="text-3xl font-bold text-white">{demo.matches}</p>
                </div>
                <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        );
      case 'lead-capture':
        return (
          <div className="bg-gray-900 rounded-2xl p-6 text-white h-full flex flex-col justify-center">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-4">Lead Capture Form (in DM)</p>
            <div className="space-y-3 mb-4">
              {demo.fields.map((field, i) => (
                <div key={i} className="bg-gray-800 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-600/30 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-gray-300 text-sm">{field}</span>
                  <span className="ml-auto text-green-400 text-xs">Collected</span>
                </div>
              ))}
            </div>
            <div className="bg-gradient-to-r from-green-600/20 to-emerald-600/20 border border-green-500/30 rounded-xl p-4 text-center">
              <p className="text-green-400 text-2xl font-bold">{demo.captured}</p>
              <p className="text-green-300/70 text-sm">Leads captured this week</p>
            </div>
          </div>
        );
      case 'followup':
        return (
          <div className="bg-gray-900 rounded-2xl p-6 text-white h-full flex flex-col justify-center">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-4">Smart Follow-up Sequence</p>
            <div className="space-y-3">
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <span className="text-gray-400 text-xs">Day 0 - Instant</span>
                </div>
                <p className="text-white text-sm">{demo.initial}</p>
              </div>
              <div className="flex justify-center">
                <div className="flex flex-col items-center text-gray-500">
                  <div className="w-px h-4 bg-gray-700"></div>
                  <span className="text-xs py-1">{demo.hours}h wait</span>
                  <div className="w-px h-4 bg-gray-700"></div>
                </div>
              </div>
              <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 border border-purple-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                  <span className="text-gray-400 text-xs">Day 1 - Follow-up</span>
                </div>
                <p className="text-white text-sm">{demo.followup}</p>
              </div>
            </div>
            <div className="mt-4 text-center">
              <span className="text-purple-400 text-sm font-medium">+38% reply rate with follow-ups</span>
            </div>
          </div>
        );
      case 'analytics':
        return (
          <div className="bg-gray-900 rounded-2xl p-6 text-white h-full flex flex-col justify-center">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-4">This Week's Performance</p>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-white">{demo.stats.sent}</p>
                <p className="text-gray-400 text-xs">Sent</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-blue-400">{demo.stats.replied}</p>
                <p className="text-gray-400 text-xs">Replied</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-green-400">{demo.stats.converted}</p>
                <p className="text-gray-400 text-xs">Converted</p>
              </div>
            </div>
            <div className="bg-gray-800 rounded-xl p-4">
              <p className="text-gray-400 text-xs mb-3">Conversion Funnel</p>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">DMs Sent</span>
                    <span className="text-white">100%</span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full"><div className="h-2 bg-purple-500 rounded-full w-full"></div></div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">Replied</span>
                    <span className="text-white">47%</span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full"><div className="h-2 bg-blue-500 rounded-full" style={{width: '47%'}}></div></div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">Converted</span>
                    <span className="text-white">16%</span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full"><div className="h-2 bg-green-500 rounded-full" style={{width: '16%'}}></div></div>
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md z-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
              Replyflows
            </span>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-600 hover:text-gray-900 transition-colors">Features</a>
              <a href="#how-it-works" className="text-gray-600 hover:text-gray-900 transition-colors">How It Works</a>
              <a href="#pricing" className="text-gray-600 hover:text-gray-900 transition-colors">Pricing</a>
              <a href="#faq" className="text-gray-600 hover:text-gray-900 transition-colors">FAQ</a>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => goTo('/login')}
                className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
              >
                Log in
              </button>
              <button
                onClick={() => goTo('/register')}
                className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-purple-500/30 transition-all"
              >
                Get Started Free
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-28 pb-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="flex-1 text-center lg:text-left">
              {/* Official API Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-50 border border-purple-200 rounded-full text-purple-700 text-sm font-medium mb-6">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Built on Official Instagram APIs
              </div>
              <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
                Automate Your Instagram DMs &
                <span className="bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent"> Grow on Autopilot</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8 max-w-xl">
                Engage every commenter with instant, personalized DMs. Capture leads, drive sales, and scale your Instagram - all automatically.
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
                <button
                  onClick={() => goTo('/register')}
                  className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-xl font-semibold text-lg hover:shadow-xl hover:shadow-purple-500/30 transition-all flex items-center justify-center gap-2"
                >
                  Get Started Free
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
                <p className="text-gray-500 text-sm">No credit card required</p>
              </div>
              <div className="flex items-center gap-6 text-sm text-gray-500 justify-center lg:justify-start">
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  1,000 free DMs/month
                </span>
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  No coding needed
                </span>
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Official Meta API
                </span>
              </div>
            </div>

            {/* Hero right - Demo visual */}
            <div className="flex-1 max-w-lg w-full">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-pink-500/20 rounded-2xl blur-3xl"></div>
                <div className="relative bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-gray-800">
                  <div className="flex items-center gap-2 px-4 py-3 bg-gray-800 border-b border-gray-700">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="ml-4 text-gray-400 text-sm">Replyflows Dashboard</span>
                  </div>
                  <div className="p-6 bg-gradient-to-br from-gray-900 to-gray-800">
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700">
                        <p className="text-gray-400 text-xs">DMs Sent</p>
                        <p className="text-2xl font-bold text-white">1,247</p>
                        <p className="text-green-400 text-xs">+23%</p>
                      </div>
                      <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700">
                        <p className="text-gray-400 text-xs">Reply Rate</p>
                        <p className="text-2xl font-bold text-white">47%</p>
                        <p className="text-green-400 text-xs">+8%</p>
                      </div>
                      <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700">
                        <p className="text-gray-400 text-xs">Leads</p>
                        <p className="text-2xl font-bold text-white">203</p>
                        <p className="text-green-400 text-xs">+15%</p>
                      </div>
                    </div>
                    <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex-shrink-0"></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium text-sm">@user commented "PRICE"</p>
                          <p className="text-gray-400 text-xs">Auto DM sent with pricing link</p>
                        </div>
                        <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded-full text-xs whitespace-nowrap">Sent</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value Proposition Bar */}
      <section className="py-8 bg-gray-50 border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-3 gap-4">
            {[
              { value: 'Instant', label: 'DM Delivery' },
              { value: '2 Min', label: 'Setup Time' },
              { value: 'Free', label: 'To Get Started' }
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <p className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
                  {stat.value}
                </p>
                <p className="text-gray-500 text-sm">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* See It In Action - Features with Demo (ManyChat style) */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              See It In Action
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Click on any feature to see exactly how it works
            </p>
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            {/* Left - Feature list */}
            <div className="lg:w-1/2 space-y-2">
              {features.map((feature, index) => (
                <button
                  key={index}
                  onClick={() => setActiveFeature(index)}
                  className={`w-full text-left p-5 rounded-2xl transition-all ${
                    activeFeature === index
                      ? 'bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 shadow-md'
                      : 'bg-white border-2 border-transparent hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      activeFeature === index
                        ? 'bg-gradient-to-br from-purple-600 to-pink-500 text-white'
                        : 'bg-gray-100 text-gray-400'
                    }`}>
                      <span className="text-lg font-bold">{index + 1}</span>
                    </div>
                    <div>
                      <h3 className={`text-lg font-semibold mb-1 ${
                        activeFeature === index ? 'text-purple-700' : 'text-gray-900'
                      }`}>
                        {feature.title}
                      </h3>
                      {activeFeature === index && (
                        <p className="text-gray-600 text-sm">{feature.description}</p>
                      )}
                    </div>
                    <svg className={`w-5 h-5 ml-auto mt-1 transition-transform flex-shrink-0 ${
                      activeFeature === index ? 'rotate-90 text-purple-600' : 'text-gray-300'
                    }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>

            {/* Right - Demo preview */}
            <div className="lg:w-1/2">
              <div className="sticky top-24">
                {renderFeatureDemo(features[activeFeature])}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              How It Works
            </h2>
            <p className="text-lg text-gray-600">
              Set up in under 2 minutes. No coding required.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {howItWorks.map((item) => (
              <div key={item.step} className="relative">
                <div className="absolute -top-4 -left-4 w-12 h-12 bg-gradient-to-br from-purple-600 to-pink-500 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-lg">
                  {item.step}
                </div>
                <div className="bg-white rounded-2xl p-8 pt-12 shadow-lg border border-gray-100 h-full">
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">{item.title}</h3>
                  <p className="text-gray-600">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-gray-600">
              Start free. Upgrade when you're ready.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Plan */}
            <div className="bg-white rounded-2xl p-8 border-2 border-gray-200 hover:border-purple-200 transition-colors">
              <h3 className="text-2xl font-bold text-gray-900 mb-1">Free</h3>
              <p className="text-gray-500 mb-4">Everything you need to get started</p>
              <div className="mb-6">
                <span className="text-5xl font-bold text-gray-900">$0</span>
                <span className="text-gray-500">/forever</span>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  '1,000 DMs per month',
                  '1,000 contacts',
                  'Keyword triggers',
                  'Conversion event tracking',
                  'Metrics & logs',
                  'Community access'
                ].map((f, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => goTo('/register')}
                className="w-full py-3 bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 transition-colors"
              >
                Start Free
              </button>
            </div>

            {/* Pro Plan */}
            <div className="relative bg-gradient-to-br from-purple-600 to-pink-500 rounded-2xl p-8 text-white shadow-xl shadow-purple-500/30">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-yellow-400 text-yellow-900 rounded-full text-sm font-semibold">
                Most Popular
              </div>
              <h3 className="text-2xl font-bold mb-1">Pro</h3>
              <p className="text-purple-100 mb-4">For creators ready to scale</p>
              <div className="mb-6">
                <span className="text-5xl font-bold">$5</span>
                <span className="text-purple-100">/month</span>
                <p className="text-purple-200 text-sm mt-1">~ &#8377;500/month</p>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  'Unlimited DMs',
                  'Unlimited contacts',
                  'Unlimited keyword triggers',
                  'Smart follow-ups',
                  'Lead capture & CSV export',
                  'Advanced analytics',
                  'Priority support'
                ].map((f, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-white">{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => goTo('/register')}
                className="w-full py-3 bg-white text-purple-600 rounded-xl font-semibold hover:bg-gray-100 transition-colors"
              >
                Start Pro Trial
              </button>
            </div>
          </div>

          {/* Price Comparison */}
          <div className="mt-12 max-w-4xl mx-auto">
            <h3 className="text-xl font-semibold text-gray-900 text-center mb-6">Feature Comparison</h3>
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-4 px-6 text-gray-600 font-medium">Feature</th>
                    <th className="text-center py-4 px-6 text-gray-600 font-medium">Free</th>
                    <th className="text-center py-4 px-6 text-purple-600 font-medium">Pro</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['DMs per month', '1,000', 'Unlimited'],
                    ['Contacts', '1,000', 'Unlimited'],
                    ['Keyword triggers', '3', 'Unlimited'],
                    ['Follow-ups', '-', true],
                    ['Lead capture', '-', true],
                    ['Advanced analytics', '-', true],
                    ['CSV export', '-', true],
                    ['Priority support', '-', true],
                    ['Community access', true, true],
                    ['Conversion tracking', true, true],
                  ].map(([feature, free, pro], i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="py-3 px-6 text-gray-700 text-sm">{feature}</td>
                      <td className="py-3 px-6 text-center text-sm">
                        {free === true ? (
                          <svg className="w-5 h-5 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : free === '-' ? (
                          <span className="text-gray-300">-</span>
                        ) : (
                          <span className="text-gray-700">{free}</span>
                        )}
                      </td>
                      <td className="py-3 px-6 text-center text-sm">
                        {pro === true ? (
                          <svg className="w-5 h-5 text-purple-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <span className="text-purple-700 font-medium">{pro}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 px-6 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Frequently Asked Questions
            </h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, index) => (
              <div key={index} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="w-full text-left px-6 py-5 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-gray-900 pr-4">{faq.question}</span>
                  <svg
                    className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${
                      openFaq === index ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openFaq === index && (
                  <div className="px-6 pb-5">
                    <p className="text-gray-600 leading-relaxed">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-purple-600 to-pink-500 rounded-3xl p-12 text-center text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30"></div>
            <div className="relative">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                Ready to Automate Your Instagram DMs?
              </h2>
              <p className="text-xl text-purple-100 mb-8 max-w-2xl mx-auto">
                Join creators who automate their Instagram DMs and grow on autopilot with Replyflows.
              </p>
              <button
                onClick={() => goTo('/register')}
                className="px-8 py-4 bg-white text-purple-600 rounded-xl font-semibold text-lg hover:shadow-xl transition-all inline-flex items-center gap-2"
              >
                Get Started Free
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
              <p className="mt-4 text-purple-200 text-sm">No credit card required - 1,000 free DMs/month</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-gray-100">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <span className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
                Replyflows
              </span>
              <p className="text-gray-600 text-sm mt-3">
                Automate your Instagram DMs and turn comments into customers.
              </p>
              <div className="flex items-center gap-2 mt-4 text-sm text-gray-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Official Instagram APIs
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-4">Product</h4>
              <ul className="space-y-2 text-gray-600 text-sm">
                <li><a href="#features" className="hover:text-purple-600">Features</a></li>
                <li><a href="#pricing" className="hover:text-purple-600">Pricing</a></li>
                <li><a href="#faq" className="hover:text-purple-600">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-4">Company</h4>
              <ul className="space-y-2 text-gray-600 text-sm">
                <li><a href="#faq" className="hover:text-purple-600">FAQ</a></li>
                <li><a href="mailto:support@replyflows.in" className="hover:text-purple-600">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-4">Legal</h4>
              <ul className="space-y-2 text-gray-600 text-sm">
                <li><a href="https://api.replyflows.in/privacy-policy" target="_blank" rel="noopener noreferrer" className="hover:text-purple-600">Privacy Policy</a></li>
                <li><a href="https://api.replyflows.in/terms" target="_blank" rel="noopener noreferrer" className="hover:text-purple-600">Terms of Service</a></li>
                <li><a href="https://api.replyflows.in/data-deletion" target="_blank" rel="noopener noreferrer" className="hover:text-purple-600">Data Deletion</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-gray-500 text-sm">
              &copy; 2025 Replyflows. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <a href="#" className="text-gray-400 hover:text-purple-600 transition-colors">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073z"/>
                </svg>
              </a>
              <a href="#" className="text-gray-400 hover:text-purple-600 transition-colors">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
