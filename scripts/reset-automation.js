const mongoose = require('mongoose');
const Automation = require('../backend/models/Automation');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:52552/');
  const res = await Automation.updateOne(
    { _id: '6abff62aae30b4ea66bd1b7b' },
    {
      $set: {
        status: 'SCHEDULED',
        scheduledStartTime: new Date(),
        healthStatus: 'HEALTHY',
        cameraStatus: 'ONLINE',
        rtspStatus: 'NOT_TESTED',
        mediamtxStatus: 'READY',
        failureStage: 'NONE',
        failureCode: null,
        lastError: null
      }
    }
  );
  console.log('Reset result:', res);
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
