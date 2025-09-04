const cloud = require('wx-server-sdk');
cloud.init();
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { action, studentId, scheduleId, cardLabel, force } = event;

  try {
    // 获取卡信息
    const cardRes = await db.collection('people')
      .where({ studentId, label: cardLabel })
      .get();
    if (cardRes.data.length === 0) {
      return { success: false, msg: '未找到该卡信息' };
    }
    const card = cardRes.data[0];
    const type = card.type; // month, season, halfYear, year, count, private
    const isCountCard = (type === 'count' || type === 'private');

    // 检查卡是否过期（所有卡型都检查）
    const now = new Date();
    if (card.expireDate && new Date(card.expireDate) < now) {
      return { success: false, msg: '该卡已过期' };
    }

    if (action === 'reserve') {
      // 检查是否已预约
      const exist = await db.collection('booking')
        .where({ studentId, scheduleId, cardLabel }).count();
      if (exist.total > 0) {
        return { success: false, msg: '已预约该课程' };
      }

      // 次卡/私教卡且非强制预约 → 检查次数
      if (isCountCard && !force) {
        if (!card.remainCount || card.remainCount <= 0) {
          return { success: false, msg: '剩余次数不足' };
        }
      }

      // 写入 booking
      await db.collection('booking').add({
        data: {
          studentId,
          scheduleId,
          cardLabel,
          createTime: db.serverDate(),
          status: 1
        }
      });

      // 更新 schedules
      await db.collection('schedules').doc(scheduleId).update({
        data: {
          bookedCount: _.inc(1),
          students: _.push({ studentId, cardLabel })
        }
      });

      // 扣卡（次卡/私教卡 且 非强制预约）
      if (isCountCard && !force) {
        await db.collection('people').doc(card._id).update({
          data: {
            remainCount: _.inc(-1)
          }
        });
      }

      return { success: true };
    }

    if (action === 'cancel') {
      // 删除 booking
      await db.collection('booking')
        .where({ studentId, scheduleId, cardLabel }).remove();

      // 更新 schedules
      await db.collection('schedules').doc(scheduleId).update({
        data: {
          bookedCount: _.inc(-1),
          students: _.pull({ studentId })
        }
      });

      // 返还次数（次卡/私教卡 且 非强制预约）
      if (isCountCard && !force) {
        await db.collection('people').doc(card._id).update({
          data: {
            remainCount: _.inc(1)
          }
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
