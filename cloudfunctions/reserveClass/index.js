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
    // 找学生
    const stuDoc = await db.collection('people').doc(studentId).get();
    const student = stuDoc.data;
    if (!student) return { success: false, msg: '未找到该学生' };

    // 找卡
    const cards = Array.isArray(student.cards) ? student.cards : [];
    const cardIdx = cards.findIndex(c => c && c.label === cardLabel);
    if (cardIdx < 0) return { success: false, msg: '未找到该卡信息' };

    const card = cards[cardIdx];
    const isCountCard = ['count', 'private'].includes(card.type);

    // 校验过期
    if (card.expireDate && new Date(card.expireDate) < new Date()) {
      return { success: false, msg: '该卡已过期' };
    }

    if (action === 'reserve') {
      // 去重
      const exist = await db.collection('booking').where({
        studentId, weekStart, courseType, courseDate, lessonIndex, cardLabel, status: 1
      }).count();
      if (exist.total > 0) return { success: false, msg: '已预约该课程' };

      // 次卡扣次前校验
      if (isCountCard && !forced && (!card.remainCount || card.remainCount <= 0)) {
        return { success: false, msg: '剩余次数不足' };
      }

      // 写 booking
      await db.collection('booking').add({
        data: {
          studentId, name: student.name || '', cardLabel,
          weekStart, courseType, courseDate, lessonIndex,
          createTime: db.serverDate(), status: 1
        }
      });

      // 扣次
      if (isCountCard && !forced) {
        await db.collection('people').doc(studentId).update({
          data: { [`cards.${cardIdx}.remainCount`]: _.inc(-1) }
        });
      }

      return { success: true };
    }

    if (action === 'cancel') {
      await db.collection('booking').where({
        studentId, weekStart, courseType, courseDate, lessonIndex, cardLabel, status: 1
      }).remove();

      if (isCountCard && !forced) {
        await db.collection('people').doc(studentId).update({
          data: { [`cards.${cardIdx}.remainCount`]: _.inc(1) }
        });
      }

      return { success: true };
    }

    return { success: false, msg: '未知操作类型' };
  } catch (err) {
    console.error(err);
    return { success: false, msg: '服务器错误' };
  }
};

