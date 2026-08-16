export function applyConfig(Game) {
  Object.assign(Game.prototype, {
    detectMobile() {
      // Check user agent
      const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
      const isMobileUA = mobileRegex.test(navigator.userAgent);
    
      // Check screen size
      const isMobileScreen = window.innerWidth <= 768;
    
      // Check touch capability
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
      return isMobileUA || (isMobileScreen && hasTouch);
    }
  });
}
