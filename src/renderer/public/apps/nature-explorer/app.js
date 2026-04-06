var NatureApp = (function () {
  'use strict';

  var FALLBACK_IMG = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
    '<rect fill="#e0d5c5" width="200" height="200"/>' +
    '<text x="100" y="90" text-anchor="middle" font-size="48">🌿</text>' +
    '<text x="100" y="120" text-anchor="middle" font-size="14" fill="#8B6F47">No image</text>' +
    '</svg>'
  );

  var HABITAT_EMOJIS = {
    forest: '🌲', rainforest: '🌴', ocean: '🌊', desert: '🏜️',
    grassland: '🌾', wetland: '🐸', tundra: '❄️', mountain: '🏔️',
    'coral reef': '🪸', savanna: '🦁', freshwater: '🐟', urban: '🏙️'
  };

  var BADGE_CLASSES = {
    LC: 'badge-lc', NT: 'badge-nt', VU: 'badge-vu',
    EN: 'badge-en', CR: 'badge-cr', EW: 'badge-ew',
    EX: 'badge-ex', DD: 'badge-dd', NE: 'badge-ne'
  };

  var BADGE_LABELS = {
    LC: 'Least Concern', NT: 'Near Threatened', VU: 'Vulnerable',
    EN: 'Endangered', CR: 'Critically Endangered', EW: 'Extinct in Wild',
    EX: 'Extinct', DD: 'Data Deficient', NE: 'Not Evaluated'
  };

  var currentView = 'welcome';
  var previousView = 'welcome';

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') node.className = attrs[k];
        else if (k === 'textContent') node.textContent = attrs[k];
        else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (children) {
      children.forEach(function (child) {
        if (typeof child === 'string') node.appendChild(document.createTextNode(child));
        else if (child) node.appendChild(child);
      });
    }
    return node;
  }

  function makeImgWithFallback(src, alt, className) {
    var img = el('img', { src: src || FALLBACK_IMG, alt: alt || '', className: className || '' });
    img.onerror = function () { this.onerror = null; this.src = FALLBACK_IMG; };
    return img;
  }

  function makeBadge(status) {
    if (!status) return null;
    var code = status.toUpperCase();
    var cls = BADGE_CLASSES[code] || 'badge-ne';
    var label = BADGE_LABELS[code] || status;
    return el('span', { className: 'badge ' + cls, textContent: label });
  }

  function makeBackBtn(targetView) {
    return el('button', {
      className: 'back-btn',
      textContent: '\u2190 Back',
      onClick: function () { showView(targetView || 'welcome'); }
    });
  }

  function showView(viewName) {
    var views = ['welcome', 'results', 'detail', 'habitat', 'comparison'];
    views.forEach(function (v) {
      var node = document.getElementById(v);
      if (node) node.style.display = v === viewName ? 'block' : 'none';
    });
    previousView = currentView;
    currentView = viewName;
    window.scrollTo(0, 0);
    setTimeout(function () {
      var appEl = document.getElementById('app');
      if (appEl && typeof ChatBridge !== 'undefined') {
        ChatBridge.resize(appEl.scrollHeight + 32);
      }
    }, 50);
  }

  function showLoading(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    container.appendChild(el('div', { className: 'loading' }, [
      el('div', { className: 'loading-spinner' }),
      el('p', { textContent: 'Loading...' })
    ]));
    showView(containerId);
  }

  function showError(containerId, message) {
    var container = document.getElementById(containerId);
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    container.appendChild(el('div', { className: 'error-msg', textContent: message }));
    showView(containerId);
  }

  function clearContainer(container) {
    while (container.firstChild) container.removeChild(container.firstChild);
  }

  function fetchSpeciesDetail(speciesId) {
    showLoading('detail');
    fetch('/api/nature/species/' + encodeURIComponent(speciesId))
      .then(function (res) { return res.json(); })
      .then(function (detail) {
        renderSpeciesDetail(detail);
        if (typeof ChatBridge !== 'undefined') {
          ChatBridge.sendState({ view: 'detail', species: detail.common_name || detail.scientific_name });
        }
      })
      .catch(function () { showError('detail', 'Failed to load species details.'); });
  }

  // --- Species Card ---
  function makeSpeciesCard(species, onClick) {
    var imgUrl = species.image_url || species.imageUrl ||
                 (species.images && species.images[0] && species.images[0].url);
    var handler = onClick || function () {};
    var card = el('div', {
      className: 'species-card',
      tabindex: '0',
      role: 'button',
      'aria-label': (species.common_name || species.commonName || 'Species') + ' — click to view details',
      onClick: handler,
      onKeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } }
    }, [
      makeImgWithFallback(imgUrl, species.common_name || species.commonName, 'species-card-img'),
      el('div', { className: 'species-card-body' }, [
        el('div', { className: 'species-card-name',
          textContent: species.common_name || species.commonName || 'Unknown' }),
        el('div', { className: 'species-card-sci',
          textContent: species.scientific_name || species.scientificName || '' }),
        makeBadge(species.iucn_status || species.conservation_status || species.conservationStatus)
      ].filter(Boolean))
    ]);
    return card;
  }

  // --- Render Search Results ---
  function renderSearchResults(data) {
    var container = document.getElementById('results');
    clearContainer(container);

    var results = data.results || data.species || data;
    if (!Array.isArray(results)) results = [];

    container.appendChild(makeBackBtn('welcome'));
    container.appendChild(el('h2', { className: 'section-header', textContent: 'Search Results' }));

    if (data.query) {
      container.appendChild(el('p', { className: 'section-subheader',
        textContent: 'Results for \u201C' + data.query + '\u201D' }));
    }

    if (results.length === 0) {
      container.appendChild(el('div', { className: 'no-results' }, [
        el('div', { className: 'no-results-icon', textContent: '🔍' }),
        el('p', { textContent: 'No species found. Try a different search!' })
      ]));
      showView('results');
      return;
    }

    var grid = el('div', { className: 'species-grid' });
    results.forEach(function (species) {
      var card = makeSpeciesCard(species, function () {
        if (species.id && species.id.indexOf('inat:') === 0) {
          fetchSpeciesDetail(species.id);
        } else if (species.id) {
          showError('detail', 'Detailed view is not available for this plant. Ask the chatbot for more info!');
        }
      });
      grid.appendChild(card);
    });

    container.appendChild(grid);
    showView('results');
  }

  // --- Render Species Detail ---
  function renderSpeciesDetail(species) {
    var container = document.getElementById('detail');
    clearContainer(container);

    container.appendChild(makeBackBtn(previousView !== 'detail' ? previousView : 'welcome'));

    // Hero image
    var imgUrl = species.image_url || species.imageUrl ||
                 (species.images && species.images[0] && species.images[0].url);
    var heroWrap = el('div', { className: 'detail-hero-wrap' }, [
      makeImgWithFallback(imgUrl, species.common_name || species.commonName, 'detail-hero')
    ]);

    var attr = (species.images && species.images[0] && (species.images[0].credit || species.images[0].attribution)) ||
               species.image_attribution || species.imageAttribution;
    if (attr) {
      heroWrap.appendChild(el('div', { className: 'photo-attr',
        textContent: 'Photo by ' + attr + ' on iNaturalist' }));
    }
    container.appendChild(heroWrap);

    // Header
    var headerChildren = [
      el('h1', { className: 'detail-common-name',
        textContent: species.common_name || species.commonName || 'Unknown Species' }),
      el('div', { className: 'detail-sci-name',
        textContent: species.scientific_name || species.scientificName || '' }),
      makeBadge(species.iucn_status || species.conservation_status || species.conservationStatus)
    ].filter(Boolean);
    container.appendChild(el('div', { className: 'detail-header' }, headerChildren));

    // Taxonomy
    var taxonomy = species.taxonomy;
    if (taxonomy) {
      var ranks = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species'];
      var taxEls = [];
      ranks.forEach(function (rank) {
        var val = taxonomy[rank];
        if (!val) return;
        if (taxEls.length > 0) {
          taxEls.push(el('span', { className: 'taxonomy-sep', textContent: '\u2192' }));
        }
        taxEls.push(el('span', { className: 'taxonomy-rank', title: rank, textContent: val }));
      });
      if (taxEls.length > 0) {
        container.appendChild(el('div', { className: 'taxonomy' }, taxEls));
      }
    }

    // Description (Wikipedia summary)
    var desc = species.description || species.wikipedia_summary;
    if (desc) {
      container.appendChild(makeSection('About', el('p', { textContent: desc })));
    }

    // Habitat
    var habitatVal = species.habitat || species.habitats;
    if (habitatVal) {
      var habitatText = Array.isArray(habitatVal) ? habitatVal.join(', ') : habitatVal;
      container.appendChild(makeSection('Habitat', el('p', { textContent: habitatText })));
    }

    // Diet
    var diet = species.diet;
    if (diet) {
      var dietText = Array.isArray(diet) ? diet.join(', ') : diet;
      container.appendChild(makeSection('Diet', el('p', { textContent: dietText })));
    }

    // Behavior
    var behavior = species.behavior || species.behaviours;
    if (behavior) {
      var behaviorText = Array.isArray(behavior) ? behavior.join('. ') : behavior;
      container.appendChild(makeSection('Behavior', el('p', { textContent: behaviorText })));
    }

    // Fun facts
    var facts = species.fun_facts || species.funFacts;
    if (facts && facts.length > 0) {
      var factsContainer = el('div', { className: 'detail-section' }, [
        el('h3', { textContent: 'Fun Facts' })
      ]);
      facts.forEach(function (fact) {
        factsContainer.appendChild(el('div', { className: 'fun-fact', textContent: fact }));
      });
      container.appendChild(factsContainer);
    }

    // Similar species
    var similar = species.similar_species || species.similarSpecies;
    if (similar && similar.length > 0) {
      var simSection = el('div', { className: 'detail-section' }, [
        el('h3', { textContent: 'Similar Species' })
      ]);
      var simGrid = el('div', { className: 'similar-grid' });
      similar.forEach(function (s) {
        var simImg = s.image_url || s.imageUrl ||
                     (s.images && s.images[0] && s.images[0].url);
        var simCard = el('div', { className: 'similar-card', onClick: function () {
          if (s.id) fetchSpeciesDetail(s.id);
        }}, [
          makeImgWithFallback(simImg, s.common_name || s.commonName, ''),
          el('div', { className: 'similar-card-name',
            textContent: s.common_name || s.commonName || s.name || '' })
        ]);
        simGrid.appendChild(simCard);
      });
      simSection.appendChild(simGrid);
      container.appendChild(simSection);
    }

    showView('detail');
  }

  // --- Render Habitat Grid ---
  function renderHabitatGrid(data) {
    var container = document.getElementById('habitat');
    clearContainer(container);

    var habitatName = data.habitat || data.name || 'Unknown Habitat';
    var species = data.species || data.results || [];

    container.appendChild(makeBackBtn('welcome'));

    var emoji = HABITAT_EMOJIS[habitatName.toLowerCase()] || '🌍';
    container.appendChild(el('div', { className: 'habitat-banner' }, [
      el('div', { className: 'habitat-emoji', textContent: emoji }),
      el('div', { className: 'habitat-title', textContent: habitatName })
    ]));

    if (species.length === 0) {
      container.appendChild(el('div', { className: 'no-results' }, [
        el('div', { className: 'no-results-icon', textContent: '🌿' }),
        el('p', { textContent: 'No species found in this habitat.' })
      ]));
      showView('habitat');
      return;
    }

    var grid = el('div', { className: 'species-grid' });
    species.forEach(function (s) {
      var card = makeSpeciesCard(s, function () {
        if (s.id) fetchSpeciesDetail(s.id);
      });
      grid.appendChild(card);
    });
    container.appendChild(grid);
    showView('habitat');
  }

  // --- Render Comparison ---
  function renderComparison(data) {
    var container = document.getElementById('comparison');
    clearContainer(container);

    var speciesArr = data.species || [];
    var similarities = data.similarities || [];
    var differences = data.differences || [];

    container.appendChild(makeBackBtn('welcome'));
    container.appendChild(el('div', { className: 'comparison-header' }, [
      el('h2', { className: 'section-header', textContent: 'Species Comparison' })
    ]));

    if (speciesArr.length >= 2) {
      var cols = el('div', { className: 'comparison-cols' });
      speciesArr.slice(0, 2).forEach(function (species) {
        var imgUrl = species.image_url || species.imageUrl ||
                     (species.images && species.images[0] && species.images[0].url);
        var colChildren = [
          makeImgWithFallback(imgUrl, species.common_name || species.commonName, ''),
          el('div', { className: 'comparison-col-body' }, [
            el('div', { className: 'comparison-col-name',
              textContent: species.common_name || species.commonName || 'Unknown' }),
            el('div', { className: 'comparison-col-sci',
              textContent: species.scientific_name || species.scientificName || '' }),
            makeBadge(species.iucn_status || species.conservation_status || species.conservationStatus)
          ].filter(Boolean))
        ];
        cols.appendChild(el('div', { className: 'comparison-col' }, colChildren));
      });
      container.appendChild(cols);
    }

    if (similarities.length > 0) {
      var simList = el('ul', { className: 'comparison-list similarities' });
      similarities.forEach(function (s) {
        simList.appendChild(el('li', { textContent: s }));
      });
      container.appendChild(el('div', { className: 'comparison-section' }, [
        el('h3', { textContent: 'Similarities' }),
        simList
      ]));
    }

    if (differences.length > 0) {
      var diffList = el('ul', { className: 'comparison-list differences' });
      differences.forEach(function (d) {
        diffList.appendChild(el('li', { textContent: d }));
      });
      container.appendChild(el('div', { className: 'comparison-section' }, [
        el('h3', { textContent: 'Differences' }),
        diffList
      ]));
    }

    showView('comparison');
  }

  function makeSection(title, content) {
    return el('div', { className: 'detail-section' }, [
      el('h3', { textContent: title }),
      content
    ]);
  }

  function getCurrentView() {
    return currentView;
  }

  return {
    renderSearchResults: renderSearchResults,
    renderSpeciesDetail: renderSpeciesDetail,
    renderHabitatGrid: renderHabitatGrid,
    renderComparison: renderComparison,
    showView: showView,
    showLoading: showLoading,
    showError: showError,
    getCurrentView: getCurrentView
  };
})();
