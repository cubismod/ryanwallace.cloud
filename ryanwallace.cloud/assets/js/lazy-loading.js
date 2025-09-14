// Lazy loading functionality
(function() {
  'use strict';

  // Ensure this script only initializes once
  if (window.lazyLoadInitialized) return;
  window.lazyLoadInitialized = true;

  let lazyImageObserver;

  function initLazyLoading() {
    if (!('IntersectionObserver' in window)) {
      // Fallback for browsers without Intersection Observer
      loadAllImages();
      return;
    }

    lazyImageObserver = new IntersectionObserver(function(entries, observer) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting && entry.target) {
          const lazyImage = entry.target;
          loadImage(lazyImage);
          observer.unobserve(lazyImage);
        }
      });
    }, {
      rootMargin: '50px 0px',
      threshold: 0.01
    });

    // Observe all existing lazy images
    observeLazyImages();
  }

  function loadImage(img) {
    if (!img || !img.dataset || !img.dataset.src) return;
    
    try {
      img.src = img.dataset.src;
      img.classList.remove('lazy-load');
      img.classList.add('lazy-loaded');
      
      // Remove the data-src attribute to prevent reprocessing
      delete img.dataset.src;
    } catch (error) {
      console.warn('Error loading lazy image:', error);
    }
  }

  function loadAllImages() {
    // Fallback: load all images immediately
    const lazyImages = document.querySelectorAll('img[data-src]');
    lazyImages.forEach(loadImage);
  }

  function observeLazyImages() {
    if (!lazyImageObserver) return;
    
    try {
      const lazyImages = document.querySelectorAll('img[data-src]:not(.lazy-loaded)');
      lazyImages.forEach(function(img) {
        if (img) {
          lazyImageObserver.observe(img);
        }
      });
    } catch (error) {
      console.warn('Error observing lazy images:', error);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLazyLoading);
  } else {
    initLazyLoading();
  }

  // Expose function to observe new images (for dynamic content)
  window.observeNewLazyImages = observeLazyImages;
})();
