// 引入微信云开发 SDK
const cloud = require('wx-server-sdk');

// 初始化云环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV // 确保使用当前环境
});

exports.main = async (event, context) => {
  const { id } = event;
  const db = cloud.database();

  try {
    await db.collection('trialLessons').doc(id).remove();
    return { success: true };
  } catch (e) {
    return { success: false, error: e };
  }
};
