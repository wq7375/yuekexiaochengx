const cloud = require('wx-server-sdk');
cloud.init();
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const {
    action,
    studentId, // 是id不是openid
    cardLabel,
    weekStart,
    type: courseType,
    date: courseDate,
    lessonIndex,
    isForce
  } = event;

  const forced = !!isForce;
  var logging = 'none'; // 可用于存放日志然后返回

  try {
    console.log('收到参数:', event);

    // 校验 studentId 是否存在
    if (!studentId) {
      console.error('studentId 未传入');
      return { success: false, msg: '学生ID缺失', LogInfo: logging };
    }

    // 查询学生信息
    const stuRes = await db.collection('people').where({ _id: studentId }).get();
    if (!stuRes?.data?.length) {
      console.error('未找到学生信息:', studentId);
      return { success: false, msg: '未找到该学生', LogInfo: logging };
    }

    const student = stuRes.data[0];
    const cards = Array.isArray(student.cards) ? student.cards : [];
    const cardIdx = cards.findIndex(c => c && c.label === cardLabel);
    if (cardIdx < 0) {
      console.error('未找到卡片:', cardLabel);
      return { success: false, msg: '未找到该卡信息', LogInfo: logging };
    }

    const card = cards[cardIdx];
    const isCountCard = ['count', 'private'].includes(card.type);

    // 校验卡片是否过期
    if (card.expireDate && new Date(card.expireDate) < new Date()) {
      console.warn('卡片已过期:', card.expireDate);
      return { success: false, msg: '该卡已过期', LogInfo: logging };
    }

    // 新增：验证卡类型与课程类型是否匹配
    if (action === 'reserve') {
      // 私教卡只能用于私教课
      if (card.type === 'private' && courseType !== 'private') {
        console.warn('私教卡不能用于团课:', cardLabel, courseType);
        return { success: false, msg: '私教卡只能用于私教课', LogInfo: logging };
      }
      
      // 团课卡只能用于团课
      if (card.type !== 'private' && courseType === 'private') {
        console.warn('团课卡不能用于私教课:', cardLabel, courseType);
        return { success: false, msg: '团课卡只能用于团课', LogInfo: logging };
      }
    }

    // 检查是否已预约
    const existBooking = await db.collection('booking').where({
      studentId, weekStart, courseType, courseDate, lessonIndex, status: 1
    }).get();

    if (action === 'reserve') {
      if (existBooking.data.length > 0) {
        console.warn('重复预约:', studentId, courseDate, lessonIndex);
        return { success: false, msg: '已预约过该课程', LogInfo: logging };
      }

      // 次卡校验剩余次数
      if (isCountCard && (!card.remainCount || card.remainCount <= 0)) {
        console.warn('剩余次数不足:', card.remainCount);
        return { success: false, msg: '剩余次数不足', LogInfo: logging };
      }

      // 写入预约记录
      await db.collection('booking').add({
        data: {
          studentId,
          cardLabel,
          weekStart,
          courseType,
          courseDate,
          lessonIndex,
          createTime: db.serverDate(),
          status: 1,
          isForce: forced
        }
      });

      // 次卡扣次
      if (isCountCard) {
        await db.collection('people').where({ _id: studentId }).update({
          data: {
            [`cards.${cardIdx}.remainCount`]: _.inc(-1)
          }
        });
      }

      console.log('预约成功:', studentId, courseDate, lessonIndex);
      return { success: true, LogInfo: logging };
    }

    if (action === 'cancel' || action === 'forceCancel') {
      // 放宽查询条件，不限制status，以便找到所有相关记录
      const existBooking = await db.collection('booking').where({
        studentId, 
        weekStart, 
        courseType, 
        courseDate, 
        lessonIndex
        // 移除status: 1的限制，以便找到可能被标记为取消的记录
      }).get();

      if (existBooking.data.length === 0) {
        console.warn('未找到预约记录:', studentId, courseDate, lessonIndex);
        
        // 即使没有找到预约记录，也尝试更新课表（适用于强制取消）
        if (isForce) {
          console.log('强制取消：即使没有预约记录也继续');
          // 这里不返回错误，继续执行后续操作
        } else {
          return { success: false, msg: '未预约该课程', LogInfo: logging };
        }
      } else {
        // 新增：验证取消预约时使用的卡片与预约时是否一致
        const bookingRecord = existBooking.data[0]; // 取第一条记录
        if (bookingRecord.cardLabel !== cardLabel && !isForce) {
          console.warn('取消预约时使用的卡片与预约时不一致:', 
            bookingRecord.cardLabel, cardLabel);
          return { 
            success: false, 
            msg: `取消预约需使用预约时使用的卡片: ${bookingRecord.cardLabel}`, 
            LogInfo: logging 
          };
        }

        // 删除找到的所有相关记录（可能有多个）
        for (const booking of existBooking.data) {
          await db.collection('booking').doc(booking._id).remove();
        }

        // 次卡退回次数 - 只有在卡片类型匹配时才退回
        if (isCountCard && bookingRecord.cardLabel === cardLabel) {
          await db.collection('people').where({ _id: studentId }).update({
            data: {
              [`cards.${cardIdx}.remainCount`]: _.inc(1)
            }
          });
        } else if (isCountCard && bookingRecord.cardLabel !== cardLabel && isForce) {
          console.warn('强制取消: 卡片不匹配，不退回次数');
        }
      }

      console.log('取消成功:', studentId, courseDate, lessonIndex);
      return { success: true, LogInfo: logging };
    }

    console.warn('未知操作类型:', action);
    return { success: false, msg: '未知操作类型', LogInfo: logging };
  } catch (err) {
    console.error('云函数异常:', err);
    return { success: false, msg: '服务器错误', LogInfo: logging };
  }
};