'use strict';
// 자동 저장 순서 관리.
// - schedule(): 메모처럼 자주 바뀌는 것. 0.5초 동안 더 바뀌지 않으면 저장
// - flush(): 체크, 창 닫기, 차시 이동, 종료 등. 기다리지 않고 바로 저장 (기다리던 저장도 함께 처리)

const STATUS = { SAVING: '저장 중…', SAVED: '저장됨', ERROR: '저장 오류' };

class SaveScheduler {
  constructor({ save, delay = 500, onStatus = () => {}, onError = () => {}, timers = { setTimeout, clearTimeout } }) {
    this.saveFn = save;
    this.delay = delay;
    this.onStatus = onStatus;
    this.onError = onError;
    this.timers = timers;
    this.timer = null;
    this.status = STATUS.SAVED;
  }

  setStatus(status) {
    this.status = status;
    this.onStatus(status);
  }

  get pending() {
    return this.timer !== null;
  }

  schedule() {
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.setStatus(STATUS.SAVING);
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.delay);
  }

  // 성공하면 true
  flush() {
    if (this.timer !== null) {
      this.timers.clearTimeout(this.timer);
      this.timer = null;
    }
    this.setStatus(STATUS.SAVING);
    try {
      this.saveFn();
      this.setStatus(STATUS.SAVED);
      return true;
    } catch (err) {
      this.setStatus(STATUS.ERROR);
      this.onError(err);
      return false;
    }
  }
}

module.exports = { SaveScheduler, STATUS };
