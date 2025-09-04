const cloud = require('wx-server-sdk');
cloud.init();
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const {
    action, studentId, cardLabel,
    weekStart, type: courseType, date: courseDate, lessonIndex,
    isForce, force
  } = event;

  const forced = !!(isForce ?? force);

  try {
    console.log('收到参数:', event);

    // 校验 studentId 是否存在
    if (!studentId) {
      console.error('studentId 未传入');
      return { success: false, msg: '学生ID缺失' };
    }

    // 用 openid 查询 people 表
    const stuRes = await db.collection('people').where({ openid: studentId }).get();
    if (!stuRes || !stuRes.data || stuRes.data.length === 0) {
      console.error('未找到学生信息:', studentId);
      return { success: false, msg: '未找到该学生' };
    }

    const student = stuRes.data[0];

    // 获取卡片信息
    const cards = Array.isArray(student.cards) ? student.cards : [];
    const cardIdx = cards.findIndex(c => c && c.label === cardLabel);
    if (cardIdx < 0) {
      console.error('未找到卡片:', cardLabel);
      return { success: false, msg: '未找到该卡信息' };
    }

    const card = cards[cardIdx];
    const isCountCard = ['count', 'private'].includes(card.type);

    // 校验卡片是否过期
    if (card.expireDate && new Date(card.expireDate) < new Date()) {
      console.warn('卡片已过期:', card.expireDate);
      return { success: false, msg: '该卡已过期' };
    }

    if (action === 'reserve') {
      // 检查是否已预约
      const exist = await db.collection('booking').where({
        studentId, weekStart, courseType, courseDate, lessonIndex, cardLabel, status: 1
      }).count();

      if (exist.total > 0) {
        console.warn('重复预约:', studentId, courseDate, lessonIndex);
        return { success: false, msg: '已预约该课程' };
      }

      // 次卡校验剩余次数
      if (isCountCard && !forced && (!card.remainCount || card.remainCount <= 0)) {
        console.warn('剩余次数不足:', card.remainCount);
        return { success: false, msg: '剩余次数不足' };
      }

      // 写入预约记录
      await db.collection('booking').add({
        data: {
          studentId,
          name: student.name || '',
          cardLabel,
          weekStart,
          courseType,
          courseDate,
          lessonIndex,
          createTime: db.serverDate(),
          status: 1
        }
      });

      // 次卡扣次
      if (isCountCard && !forced) {
        await db.collection('people').where({ openid: studentId }).update({
          data: {
            [`cards.${cardIdx}.remainCount`]: _.inc(-1)
          }
        });
      }

      console.log('预约成功:', studentId, courseDate, lessonIndex);
      return { success: true };
    }

    if (action === 'cancel') {
      // 删除预约记录
      await db.collection('booking').where({
        studentId, weekStart, courseType, courseDate, lessonIndex, cardLabel, status: 1
      }).remove();

      // 次卡退回次数
      if (isCountCard && !forced) {
        await db.collection('people').where({ openid: studentId }).update({
          data: {
            [`cards.${cardIdx}.remainCount`]: _.inc(1)
          }
        });
      }

      console.log('取消成功:', studentId, courseDate, lessonIndex);
      return { success: true };
    }

    console.warn('未知操作类型:', action);
    return { success: false, msg: '未知操作类型' };
  } catch (err) {
    console.error('云函数异常:', err);
    return { success: false, msg: '服务器错误' };
  }
};
