const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../config/database');
const Automation = require('../models/Automation');
const FacebookAccount = require('../models/FacebookAccount');
const FacebookPage = require('../models/FacebookPage');
const Media = require('../models/Media');
const User = require('../models/User');
const schedulerService = require('../services/schedulerService');

async function testRecurring() {
  console.log('--- STARTING RECURRING SCHEDULE TEST ---');
  await connectDB();
  console.log('MongoDB Connected');

  // Find or create default user
  let user = await User.findOne();
  if (!user) {
    user = await User.create({ name: 'Test User', email: 'test@example.com' });
  }

  // Find or create mock FB account & page
  let account = await FacebookAccount.findOne({ userId: user._id });
  if (!account) {
    account = new FacebookAccount({
      userId: user._id,
      fbUserId: 'mock_fb_123',
      name: 'Mock FB User',
      isMock: true
    });
    account.setAccessToken('EAAMockToken123');
    await account.save();
  }

  let page = await FacebookPage.findOne({ userId: user._id });
  if (!page) {
    page = new FacebookPage({
      facebookAccountId: account._id,
      userId: user._id,
      pageId: 'mock_page_456',
      name: 'Test Stream Page',
      isMock: true
    });
    page.setPageAccessToken('EAAMockPageToken456');
    await page.save();
  }

  let media = await Media.findOne({ userId: user._id });
  if (!media) {
    media = await Media.create({
      userId: user._id,
      filename: 'sample_video.mp4',
      originalName: 'Sample Video.mp4',
      filePath: 'uploads/sample_video.mp4',
      durationSeconds: 120
    });
  }

  const now = new Date();
  const startLocalHour = String(now.getHours()).padStart(2, '0');
  const startLocalMin = String(Math.max(0, now.getMinutes() - 5)).padStart(2, '0');
  const endLocalHour = String((now.getHours() + 2) % 24).padStart(2, '0');
  const endLocalMin = String(now.getMinutes()).padStart(2, '0');

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayDay = dayNames[now.getDay()];

  console.log(`Current Time: ${now.toLocaleString()} | Day: ${todayDay}`);
  console.log(`Setting schedule window: ${startLocalHour}:${startLocalMin} to ${endLocalHour}:${endLocalMin}`);

  // Create Recurring Window Automation
  const auto = new Automation({
    userId: user._id,
    facebookPageId: page._id,
    mediaId: media._id,
    name: 'Web Verification Recurring Automation',
    title: 'Test Live Stream Title',
    description: 'Testing recurring window scheduling feature',
    scheduleName: 'Shift 1 Live Broadcast',
    scheduleMode: 'RECURRING_WINDOW',
    startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000), // Yesterday
    endDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days later
    daysOfWeek: [todayDay],
    dailyStartTime: `${startLocalHour}:${startLocalMin}`,
    dailyEndTime: `${endLocalHour}:${endLocalMin}`,
    enableDailyWindow: true,
    scheduledStartTime: now,
    timezone: 'Asia/Kolkata',
    status: 'SCHEDULED'
  });

  await auto.save();
  console.log(`Created Automation ID: ${auto._id}`);

  // Test Scheduler Condition Evaluation
  const conditionMet = schedulerService._evaluateScheduleCondition(auto);
  console.log(`Evaluated Schedule Condition: MET? => ${conditionMet}`);

  if (conditionMet) {
    console.log('SUCCESS: Schedule condition evaluation passed!');
  } else {
    console.error('FAILED: Schedule condition evaluation did not match expected window!');
  }

  // Cleanup test automation
  await Automation.findByIdAndDelete(auto._id);
  console.log('Cleaned up test automation.');

  await disconnectDB();
  console.log('--- RECURRING SCHEDULE TEST COMPLETE ---');
}

testRecurring().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
