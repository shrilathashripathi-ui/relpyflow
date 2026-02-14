import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { instagramAPI, automationAPI, subscriptionAPI } from '../utils/api';

// Media Tile component
const MediaTile = ({ item, isSelected, onClick, index }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const imageUrl = item.thumbnail_url || item.media_url;

  const handleImageError = () => {
    if (retryCount < 2) {
      setTimeout(() => setRetryCount(retryCount + 1), 1000);
    } else {
      setImageFailed(true);
    }
  };

  return (
    <div
      onClick={onClick}
      className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${
        isSelected ? 'border-blue-500 ring-2 ring-blue-500 ring-offset-1' : 'border-gray-200 hover:border-purple-300'
      }`}
    >
      {!imageLoaded && !imageFailed && imageUrl && (
        <div className="absolute inset-0 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-pulse">
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>
      )}
      {imageUrl && !imageFailed && (
        <img
          key={`${item.id}-${retryCount}`}
          src={imageUrl}
          alt={item.caption?.substring(0, 30) || `Post ${index + 1}`}
          className={`w-full h-full object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setImageLoaded(true)}
          onError={handleImageError}
        />
      )}
      {(imageFailed || !imageUrl) && (
        <div className="w-full h-full bg-gradient-to-br from-purple-50 to-blue-50 flex flex-col items-center justify-center p-2">
          <svg className="w-10 h-10 text-purple-300 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-xs text-purple-400 text-center">Post {index + 1}</span>
        </div>
      )}
      {item.media_type === 'VIDEO' && (
        <div className="absolute top-2 left-2 bg-black/60 rounded-full p-1">
          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </div>
      )}
      {isSelected && (
        <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-lg">
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        </div>
      )}
    </div>
  );
};

const CreateAutomation = () => {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const isEditMode = Boolean(editId);

  const [unlockedSteps, setUnlockedSteps] = useState([1]);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Media
  const [media, setMedia] = useState([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState([]);
  const [mediaError, setMediaError] = useState('');

  // Step 2: Keywords
  const [keywords, setKeywords] = useState([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [replyToComments, setReplyToComments] = useState(false);
  const [commentReplies, setCommentReplies] = useState([
    'Got it, check your inbox! 📬',
    'Great! Check your messages 💌',
    'Sent :)',
    'Check your DM'
  ]);
  const [showReplyModal, setShowReplyModal] = useState(false);

  // Step 3: DM Flow
  const [openingDmEnabled, setOpeningDmEnabled] = useState(true);
  const [openingMessage, setOpeningMessage] = useState("Hey there! I'm so happy you're here, thanks so much for your interest 😊\n\nClick below and I'll send you the link in just a sec ✨");
  const [openingButton, setOpeningButton] = useState('I want my free PDF');

  const [askForFollowEnabled, setAskForFollowEnabled] = useState(false);
  const [followAskMessage, setFollowAskMessage] = useState("Nearly there! The link is especially for my followers ✨\n\nRight after you follow me, I'll send you the link so you can dive straight in! 🎉");

  const [askForEmailEnabled, setAskForEmailEnabled] = useState(false);
  const [emailAskMessage, setEmailAskMessage] = useState("You got it! Before sharing the link, I wanted you to know... I save the most exclusive content for my email family 🤗\n\nDrop your email below to get the best bits 💌");

  // Step 4: Final DM
  const [finalMessage, setFinalMessage] = useState("You're in for a treat 😊\n\nTap below to view the full catalog and see all available prices ✨");
  const [links, setLinks] = useState([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkInput, setLinkInput] = useState({ label: '', url: '' });

  const [followUpEnabled, setFollowUpEnabled] = useState(false);
  const [followUpMessage, setFollowUpMessage] = useState("If you're still curious, don't forget to tap the link ⬆️ I think you'll love it ❤️");

  // Step 5: Name
  const [automationName, setAutomationName] = useState('');

  const step2Ref = useRef(null);
  const step3Ref = useRef(null);
  const step4Ref = useRef(null);
  const step5Ref = useRef(null);
  const hasFetched = useRef(false);
  const CACHE_DURATION = 30 * 60 * 1000;

  const getCachedMedia = (accountId) => {
    try {
      const cached = localStorage.getItem(`media_cache_${accountId}`);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_DURATION) return data;
      }
    } catch (e) {}
    return null;
  };

  const setCachedMedia = (accountId, mediaList) => {
    try {
      localStorage.setItem(`media_cache_${accountId}`, JSON.stringify({ data: mediaList, timestamp: Date.now() }));
    } catch (e) {}
  };

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchInitialData();
    }
  }, []);

  // Listen for account changes from sidebar
  useEffect(() => {
    const checkAccountChange = () => {
      const savedAccountId = localStorage.getItem('selectedAccountId');
      if (savedAccountId && selectedAccount && savedAccountId !== selectedAccount.id) {
        const newAccount = accounts.find(a => a.id === savedAccountId);
        if (newAccount) {
          setSelectedAccount(newAccount);
          setSelectedMedia([]); // Clear selected media when account changes
          fetchMedia(newAccount.id);
        }
      }
    };

    const interval = setInterval(checkAccountChange, 500);
    return () => clearInterval(interval);
  }, [selectedAccount, accounts]);

  const fetchInitialData = async () => {
    try {
      const accountsRes = await instagramAPI.getAccounts();
      const accountsList = accountsRes.data.accounts || [];
      setAccounts(accountsList);

      if (accountsList.length > 0) {
        const savedAccountId = localStorage.getItem('selectedAccountId');
        const savedAccount = accountsList.find(a => a.id === savedAccountId);
        const accountToUse = savedAccount || accountsList[0];
        setSelectedAccount(accountToUse);
        fetchMedia(accountToUse.id);
      }

      try {
        const subRes = await subscriptionAPI.getStatus();
        const { plan, status } = subRes.data;
        setIsPremium(plan === 'pro' || plan === 'scale' || status === 'active' || status === 'trial');
      } catch (e) {}

      if (isEditMode) {
        await loadAutomation();
        setUnlockedSteps([1, 2, 3, 4, 5]);
      }
    } catch (error) {
      console.error('Error fetching initial data:', error);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadAutomation = async () => {
    try {
      const response = await automationAPI.getById(editId);
      const automation = response.data.automation || response.data;
      setAutomationName(automation.name || '');
      setKeywords(automation.keywords?.map(k => k.keyword) || []);
      setOpeningMessage(automation.responseMessage || openingMessage);
    } catch (error) {
      console.error('Error loading automation:', error);
    }
  };

  const fetchMedia = async (accountId, forceRefresh = false) => {
    setLoadingMedia(true);
    setMediaError('');

    if (!forceRefresh) {
      const cachedMedia = getCachedMedia(accountId);
      if (cachedMedia && cachedMedia.length > 0) {
        setMedia(cachedMedia);
        setLoadingMedia(false);
        return;
      }
    }

    try {
      const response = await instagramAPI.getMedia(accountId);
      const mediaList = response.data.media || [];
      setMedia(mediaList);
      if (mediaList.length > 0) setCachedMedia(accountId, mediaList);
    } catch (error) {
      console.error('Error fetching media:', error);
      const cachedMedia = getCachedMedia(accountId);
      if (cachedMedia && cachedMedia.length > 0) setMedia(cachedMedia);
      if (error.response?.status === 429) setMediaError('Instagram rate limited. Try again in a few minutes.');
    } finally {
      setLoadingMedia(false);
    }
  };

  const handleMediaSelect = (mediaItem) => {
    console.log('Media item clicked:', mediaItem);
    console.log('Current selectedMedia:', selectedMedia);
    if (selectedMedia.find(m => m.id === mediaItem.id)) {
      setSelectedMedia(selectedMedia.filter(m => m.id !== mediaItem.id));
    } else {
      setSelectedMedia([...selectedMedia, mediaItem]);
    }
  };

  const handleAddKeyword = () => {
    if (keywordInput.trim()) {
      const newKeywords = keywordInput.split(',').map(k => k.trim()).filter(k => k && !keywords.includes(k));
      setKeywords([...keywords, ...newKeywords]);
      setKeywordInput('');
    }
  };

  const handleRemoveKeyword = (keyword) => setKeywords(keywords.filter(k => k !== keyword));

  const handleSaveLink = () => {
    if (linkInput.label && linkInput.url) {
      setLinks([...links, { ...linkInput }]);
      setLinkInput({ label: '', url: '' });
      setShowLinkModal(false);
    }
  };

  const handleRemoveLink = (index) => setLinks(links.filter((_, i) => i !== index));

  const unlockStep = (stepNumber, ref) => {
    setError('');
    if (!unlockedSteps.includes(stepNumber)) setUnlockedSteps([...unlockedSteps, stepNumber]);
    setTimeout(() => ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleStep1Next = () => {
    console.log('Step 1 Next clicked. Selected media:', selectedMedia);
    if (selectedMedia.length === 0) { setError('Please select at least one post or reel'); return; }
    setError('');
    unlockStep(2, step2Ref);
  };

  const handleStep2Next = () => {
    if (keywords.length === 0) { setError('Please add at least one keyword'); return; }
    unlockStep(3, step3Ref);
  };

  const handleStep3Next = () => unlockStep(4, step4Ref);
  const handleStep4Next = () => unlockStep(5, step5Ref);

  const handleSubmit = async () => {
    if (!automationName.trim()) { setError('Please enter an automation name'); return; }
    if (!selectedAccount?.id) { setError('Please select an Instagram account'); return; }

    setSubmitting(true);
    setError('');

    const automationData = {
      name: automationName,
      instagramAccountId: selectedAccount?.id,
      mediaIds: selectedMedia.map(m => m.id),
      keywords,
      responseMessage: openingMessage,
      commentReplyEnabled: replyToComments,
      commentReplies,
      openingButton,
      openingDmEnabled,
      askForFollowEnabled,
      followAskMessage,
      askForEmailEnabled,
      emailAskMessage,
      finalMessage,
      links,
      followUpEnabled,
      followUpMessage,
      isActive: true
    };

    console.log('Submitting automation:', automationData);

    try {
      if (isEditMode) await automationAPI.update(editId, automationData);
      else await automationAPI.create(automationData);

      navigate('/automations');
    } catch (error) {
      console.error('Error saving automation:', error);
      console.error('Error response:', error.response?.data);
      console.error('Automation data sent:', automationData);
      setError(error.response?.data?.message || error.response?.data?.error || 'Failed to save automation');
    } finally {
      setSubmitting(false);
    }
  };

  const suggestedKeywords = ['Price', 'Link', 'Shop'];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex">
        <Sidebar />
        <div className="flex-1 ml-64 p-8 flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />

      <div className="flex-1 ml-64">
        <div className="max-w-2xl mx-auto p-8 pb-32">
          {/* Header */}
          <div className="mb-8">
            <button onClick={() => navigate('/automations')} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Automations
            </button>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm sticky top-4 z-10">
              {error}
            </div>
          )}

          {/* Step 1: Select Posts/Reels */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-6">When someone comments on</h2>
            <div className="border border-gray-200 rounded-xl p-4 mb-4 bg-white">
              <label className="flex items-center gap-3 cursor-pointer mb-4">
                <input type="radio" checked readOnly className="w-4 h-4 text-blue-600" />
                <span className="text-gray-900">a specific post or reel</span>
              </label>
              <p className="text-sm text-gray-500 mb-3">Which Post or Reel do you want to monitor?</p>

              {loadingMedia ? (
                <div className="flex flex-col items-center gap-3 text-gray-500 text-sm py-8">
                  <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                  <p>Loading your posts...</p>
                </div>
              ) : mediaError ? (
                <div className="text-center py-8">
                  <p className="text-amber-600 mb-2">{mediaError}</p>
                  <button onClick={() => selectedAccount && fetchMedia(selectedAccount.id, true)} className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm hover:bg-purple-200">Try Again</button>
                </div>
              ) : media.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-2">No posts found</p>
                  <button onClick={() => selectedAccount && fetchMedia(selectedAccount.id, true)} className="text-blue-600 text-sm hover:underline">Refresh</button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {media.slice(0, 12).map((item, index) => (
                    <MediaTile key={item.id} item={item} isSelected={!!selectedMedia.find(m => m.id === item.id)} onClick={() => handleMediaSelect(item)} index={index} />
                  ))}
                </div>
              )}
            </div>
            {!unlockedSteps.includes(2) && (
              <button onClick={handleStep1Next} className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Next</button>
            )}
          </div>

          {/* Step 2: Keywords */}
          {unlockedSteps.includes(2) && (
            <div ref={step2Ref} className="mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">And this comment has</h2>
              <div className="border border-gray-200 rounded-xl p-4 mb-4 bg-white">
                <label className="flex items-center gap-3 mb-4">
                  <input type="radio" checked readOnly className="w-4 h-4 text-blue-600" />
                  <span className="text-gray-900">a specific word or words</span>
                </label>
                <input
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddKeyword()}
                  placeholder="Enter a word or multiple"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                />
                <p className="text-sm text-blue-500 mb-3">Type the words that suit best</p>
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {keywords.map((keyword, index) => (
                      <span key={index} className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
                        {keyword}
                        <button onClick={() => handleRemoveKeyword(keyword)} className="hover:text-purple-900">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">For example:</span>
                  {suggestedKeywords.map((kw) => (
                    <button key={kw} onClick={() => !keywords.includes(kw) && setKeywords([...keywords, kw])} className="px-3 py-1 border border-gray-200 rounded-full text-sm text-gray-700 hover:bg-gray-50">{kw}</button>
                  ))}
                </div>
              </div>

              {/* Reply to comments */}
              <div className="flex items-center justify-between py-3 mb-4">
                <span className="text-gray-700">reply to their comments under the post</span>
                <button onClick={() => setReplyToComments(!replyToComments)} className={`relative w-11 h-6 rounded-full transition-colors ${replyToComments ? 'bg-purple-600' : 'bg-gray-300'}`}>
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${replyToComments ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
              {replyToComments && (
                <div className="bg-gray-50 rounded-xl p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-700">Random replies:</p>
                    <button onClick={() => setShowReplyModal(true)} className="text-purple-600 text-sm">Edit</button>
                  </div>
                  <ul className="space-y-1">
                    {commentReplies.slice(0, 3).map((reply, i) => (<li key={i} className="text-sm text-gray-600">• {reply}</li>))}
                    {commentReplies.length > 3 && <li className="text-sm text-gray-400">+{commentReplies.length - 3} more</li>}
                  </ul>
                </div>
              )}
              {!unlockedSteps.includes(3) && (
                <button onClick={handleStep2Next} className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Next</button>
              )}
            </div>
          )}

          {/* Step 3: They will get */}
          {unlockedSteps.includes(3) && (
            <div ref={step3Ref} className="mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">They will get</h2>

              {/* Opening DM */}
              <div className="border border-gray-200 rounded-xl p-4 mb-3 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-gray-900">an opening DM</span>
                  <button onClick={() => setOpeningDmEnabled(!openingDmEnabled)} className={`relative w-11 h-6 rounded-full transition-colors ${openingDmEnabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${openingDmEnabled ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
                {openingDmEnabled && (
                  <>
                    <div className="bg-gray-50 rounded-xl p-4 mb-3">
                      <textarea value={openingMessage} onChange={(e) => setOpeningMessage(e.target.value)} rows={4} className="w-full bg-transparent border-none focus:outline-none resize-none text-gray-700" placeholder="Write your opening message..." />
                    </div>
                    <div className="border border-gray-200 rounded-lg px-4 py-3">
                      <input type="text" value={openingButton} onChange={(e) => setOpeningButton(e.target.value)} placeholder="Button text" className="w-full bg-transparent border-none focus:outline-none text-gray-700" />
                    </div>
                  </>
                )}
              </div>

              {/* Ask for Follow */}
              <div className="border border-gray-200 rounded-xl p-4 mb-3 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-gray-900">a DM asking to follow you before they get the link</span>
                  <button onClick={() => setAskForFollowEnabled(!askForFollowEnabled)} className={`relative w-11 h-6 rounded-full transition-colors ${askForFollowEnabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${askForFollowEnabled ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
                {askForFollowEnabled && (
                  <div className="bg-gray-50 rounded-xl p-4">
                    <textarea value={followAskMessage} onChange={(e) => setFollowAskMessage(e.target.value)} rows={4} className="w-full bg-transparent border-none focus:outline-none resize-none text-gray-700" placeholder="Write your follow request message..." />
                  </div>
                )}
              </div>

              {/* Ask for Email */}
              <div className="border border-gray-200 rounded-xl p-4 mb-4 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-gray-900">a DM asking for their email</span>
                  <button onClick={() => setAskForEmailEnabled(!askForEmailEnabled)} className={`relative w-11 h-6 rounded-full transition-colors ${askForEmailEnabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${askForEmailEnabled ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
                {askForEmailEnabled && (
                  <div className="bg-gray-50 rounded-xl p-4">
                    <textarea value={emailAskMessage} onChange={(e) => setEmailAskMessage(e.target.value)} rows={4} className="w-full bg-transparent border-none focus:outline-none resize-none text-gray-700" placeholder="Write your email request message..." />
                  </div>
                )}
              </div>

              {!unlockedSteps.includes(4) && (
                <button onClick={handleStep3Next} className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Next</button>
              )}
            </div>
          )}

          {/* Step 4: And then, they will get */}
          {unlockedSteps.includes(4) && (
            <div ref={step4Ref} className="mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">And then, they will get</h2>

              {/* Final DM with link */}
              <div className="border border-gray-200 rounded-xl p-4 mb-3 bg-white">
                <div className="mb-3">
                  <span className="text-gray-900">a DM with the link</span>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 mb-3">
                  <textarea value={finalMessage} onChange={(e) => setFinalMessage(e.target.value)} rows={3} placeholder="Write a message..." className="w-full bg-transparent border-none focus:outline-none resize-none text-gray-700" />
                </div>

                {/* Links list */}
                {links.map((link, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg px-4 py-3 mb-2 flex items-center justify-between bg-white">
                    <span className="text-gray-700">{link.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400">🔗</span>
                      <button onClick={() => handleRemoveLink(index)} className="text-gray-400 hover:text-red-500">×</button>
                    </div>
                  </div>
                ))}

                {/* Add Link button */}
                <button onClick={() => setShowLinkModal(true)} className="w-full border border-dashed border-gray-300 rounded-lg px-4 py-3 text-gray-500 hover:border-purple-400 hover:text-purple-600 flex items-center justify-center gap-2">
                  <span>+</span> Add A Link
                </button>
              </div>

              {/* Follow up DM */}
              <div className="border border-gray-200 rounded-xl p-4 mb-4 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-gray-900">a follow up DM if they don't click the link</span>
                  <button onClick={() => setFollowUpEnabled(!followUpEnabled)} className={`relative w-11 h-6 rounded-full transition-colors ${followUpEnabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${followUpEnabled ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>
                {followUpEnabled && (
                  <div className="bg-gray-50 rounded-xl p-4">
                    <textarea value={followUpMessage} onChange={(e) => setFollowUpMessage(e.target.value)} rows={3} className="w-full bg-transparent border-none focus:outline-none resize-none text-gray-700" placeholder="Write your follow-up message..." />
                  </div>
                )}
              </div>

              {!unlockedSteps.includes(5) && (
                <button onClick={handleStep4Next} className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Next</button>
              )}
            </div>
          )}

          {/* Step 5: Name */}
          {unlockedSteps.includes(5) && (
            <div ref={step5Ref} className="mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Name your automation</h2>
              <input type="text" value={automationName} onChange={(e) => setAutomationName(e.target.value)} placeholder="e.g., Free PDF Giveaway" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 mb-6 bg-white" />
              <button onClick={handleSubmit} disabled={submitting} className="w-full py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-50">
                {submitting ? 'Creating...' : isEditMode ? 'Update Automation' : 'Create Automation'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Comment Replies Modal */}
      {showReplyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-bold text-gray-900">Setup Comment Replies</h3>
              <button onClick={() => setShowReplyModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>
            <div className="p-6">
              <p className="text-sm text-purple-600 mb-4">Add Random Comment Replies</p>
              <div className="space-y-3">
                {commentReplies.map((reply, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-purple-400 rounded-full"></span>
                    <input type="text" value={reply} onChange={(e) => { const updated = [...commentReplies]; updated[index] = e.target.value; setCommentReplies(updated); }} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    <button onClick={() => commentReplies.length > 1 && setCommentReplies(commentReplies.filter((_, i) => i !== index))} className="text-gray-400 hover:text-red-500">🗑</button>
                  </div>
                ))}
              </div>
              <button onClick={() => setCommentReplies([...commentReplies, ''])} className="mt-4 w-full py-2 border border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-purple-400">+ Add New Reply</button>
            </div>
            <div className="p-6 border-t">
              <button onClick={() => { setCommentReplies(commentReplies.filter(r => r.trim() !== '')); setShowReplyModal(false); }} className="w-full py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Link Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-bold text-gray-900">Add a link</h3>
              <button onClick={() => setShowLinkModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-2">Button label</label>
                <input type="text" value={linkInput.label} onChange={(e) => setLinkInput({ ...linkInput, label: e.target.value })} placeholder="Add a button label e.g Open" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-2">Link</label>
                <input type="url" value={linkInput.url} onChange={(e) => setLinkInput({ ...linkInput, url: e.target.value })} placeholder="Add a link" className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="p-6 border-t flex gap-3">
              <button onClick={() => { setLinkInput({ label: '', url: '' }); setShowLinkModal(false); }} className="flex-1 py-3 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSaveLink} disabled={!linkInput.label || !linkInput.url} className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateAutomation;
