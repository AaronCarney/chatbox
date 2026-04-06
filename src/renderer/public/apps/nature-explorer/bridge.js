(function () {
  'use strict';

  // API base: Railway in production, relative in dev (Vite proxy)
  var API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? ''
    : 'https://chatbox-production-d06b.up.railway.app';

  function buildQuery(params) {
    var parts = [];
    Object.keys(params).forEach(function (k) {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
      }
    });
    return parts.length > 0 ? '?' + parts.join('&') : '';
  }

  function apiGet(path) {
    return fetch(API_BASE + path).then(function (res) {
      if (!res.ok) throw new Error('API error: ' + res.status);
      return res.json();
    });
  }

  function sendState() {
    ChatBridge.sendState({ view: NatureApp.getCurrentView() });
  }

  // --- Tool Handlers ---

  function handleSearchSpecies(args, requestId) {
    NatureApp.showLoading('results');
    var query = buildQuery({ q: args.query, type: args.type, region: args.region });
    apiGet('/api/nature/search' + query)
      .then(function (data) {
        NatureApp.renderSearchResults(data);
        ChatBridge.respondToTool(requestId, data);
        sendState();
      })
      .catch(function (err) {
        NatureApp.showError('results', 'Search failed: ' + err.message);
        ChatBridge.respondToTool(requestId, { error: err.message });
      });
  }

  function handleGetSpeciesDetails(args, requestId) {
    var speciesId = args.species_id || args.speciesId || args.id;
    if (!speciesId) {
      NatureApp.showError('detail', 'No species selected.');
      ChatBridge.respondToTool(requestId, { error: 'Missing species_id' });
      return;
    }
    NatureApp.showLoading('detail');
    apiGet('/api/nature/species/' + encodeURIComponent(speciesId))
      .then(function (data) {
        NatureApp.renderSpeciesDetail(data);
        ChatBridge.respondToTool(requestId, data);
        sendState();
      })
      .catch(function (err) {
        NatureApp.showError('detail', 'Failed to load species: ' + err.message);
        ChatBridge.respondToTool(requestId, { error: err.message });
      });
  }

  function handleExploreHabitat(args, requestId) {
    NatureApp.showLoading('habitat');
    var query = buildQuery({
      habitat: args.habitat,
      type: args.type,
      region: args.region,
      limit: args.limit
    });
    apiGet('/api/nature/habitat' + query)
      .then(function (data) {
        NatureApp.renderHabitatGrid(data);
        ChatBridge.respondToTool(requestId, data);
        sendState();
      })
      .catch(function (err) {
        NatureApp.showError('habitat', 'Failed to load habitat: ' + err.message);
        ChatBridge.respondToTool(requestId, { error: err.message });
      });
  }

  function handleGetRandomSpecies(args, requestId) {
    NatureApp.showLoading('detail');
    var query = buildQuery({ type: args.type, difficulty: args.difficulty, region: args.region });
    apiGet('/api/nature/random' + query)
      .then(function (data) {
        NatureApp.renderSpeciesDetail(data);
        ChatBridge.respondToTool(requestId, data);
        sendState();
      })
      .catch(function (err) {
        NatureApp.showError('detail', 'Failed to load random species: ' + err.message);
        ChatBridge.respondToTool(requestId, { error: err.message });
      });
  }

  function handleCompareSpecies(args, requestId) {
    NatureApp.showLoading('comparison');
    var ids = args.species_ids || args.speciesIds || args.ids || [];
    if (ids.length < 2) {
      NatureApp.showError('comparison', 'Need at least 2 species to compare.');
      ChatBridge.respondToTool(requestId, { error: 'Need at least 2 species IDs' });
      return;
    }
    // Filter to inat: IDs only (perenual detail endpoint not supported)
    var supported = ids.filter(function (id) { return id.indexOf('inat:') === 0; });
    if (supported.length < 2) {
      NatureApp.showError('comparison', 'Plant comparisons are not yet supported. Try comparing animals!');
      ChatBridge.respondToTool(requestId, { error: 'Need at least 2 iNaturalist species IDs for comparison' });
      return;
    }
    ids = supported;

    var fetches = ids.map(function (id) {
      return apiGet('/api/nature/species/' + encodeURIComponent(id));
    });

    Promise.all(fetches)
      .then(function (speciesArr) {
        var result = {
          species: speciesArr,
          similarities: findSimilarities(speciesArr),
          differences: findDifferences(speciesArr)
        };
        NatureApp.renderComparison(result);
        ChatBridge.respondToTool(requestId, result);
        sendState();
      })
      .catch(function (err) {
        NatureApp.showError('comparison', 'Comparison failed: ' + err.message);
        ChatBridge.respondToTool(requestId, { error: err.message });
      });
  }

  // --- Comparison Helpers ---

  function getVal(species, snakeKey, camelKey) {
    var v = species[snakeKey] || species[camelKey];
    if (Array.isArray(v)) return v.join(', ');
    return v || '';
  }

  function findSimilarities(speciesArr) {
    if (speciesArr.length < 2) return [];
    var a = speciesArr[0];
    var b = speciesArr[1];
    var sims = [];

    var statusA = (a.iucn_status || getVal(a, 'conservation_status', 'conservationStatus') || '').toUpperCase();
    var statusB = (b.iucn_status || getVal(b, 'conservation_status', 'conservationStatus') || '').toUpperCase();
    if (statusA && statusA === statusB) {
      sims.push('Both have conservation status: ' + statusA);
    }

    var taxA = a.taxonomy || {};
    var taxB = b.taxonomy || {};
    var ranks = ['kingdom', 'phylum', 'class', 'order', 'family'];
    ranks.forEach(function (rank) {
      if (taxA[rank] && taxA[rank] === taxB[rank]) {
        sims.push('Same ' + rank + ': ' + taxA[rank]);
      }
    });

    var habA = getVal(a, 'habitat', 'habitats');
    var habB = getVal(b, 'habitat', 'habitats');
    if (habA && habA === habB) {
      sims.push('Both found in: ' + habA);
    }

    return sims;
  }

  function findDifferences(speciesArr) {
    if (speciesArr.length < 2) return [];
    var a = speciesArr[0];
    var b = speciesArr[1];
    var diffs = [];
    var nameA = getVal(a, 'common_name', 'commonName') || 'Species A';
    var nameB = getVal(b, 'common_name', 'commonName') || 'Species B';

    var statusA = a.iucn_status || getVal(a, 'conservation_status', 'conservationStatus');
    var statusB = b.iucn_status || getVal(b, 'conservation_status', 'conservationStatus');
    if (statusA && statusB && statusA.toUpperCase() !== statusB.toUpperCase()) {
      diffs.push('Conservation: ' + nameA + ' is ' + statusA + ', ' + nameB + ' is ' + statusB);
    }

    var dietA = getVal(a, 'diet', 'diet');
    var dietB = getVal(b, 'diet', 'diet');
    if (dietA && dietB && dietA !== dietB) {
      diffs.push('Diet: ' + nameA + ' eats ' + dietA + '; ' + nameB + ' eats ' + dietB);
    }

    var habA = getVal(a, 'habitat', 'habitats');
    var habB = getVal(b, 'habitat', 'habitats');
    if (habA && habB && habA !== habB) {
      diffs.push('Habitat: ' + nameA + ' lives in ' + habA + '; ' + nameB + ' lives in ' + habB);
    }

    return diffs;
  }

  // --- ChatBridge Wiring ---

  ChatBridge.on('toolInvoke', function (payload, requestId) {
    var args = payload.arguments || {};

    switch (payload.name) {
      case 'search_species':
        handleSearchSpecies(args, requestId);
        break;
      case 'get_species_details':
        handleGetSpeciesDetails(args, requestId);
        break;
      case 'explore_habitat':
        handleExploreHabitat(args, requestId);
        break;
      case 'get_random_species':
        handleGetRandomSpecies(args, requestId);
        break;
      case 'compare_species':
        handleCompareSpecies(args, requestId);
        break;
      default:
        ChatBridge.respondToTool(requestId, { error: 'Unknown tool: ' + payload.name });
    }
  });

  ChatBridge.onStateRequest(function () {
    return { view: NatureApp.getCurrentView() };
  });

  ChatBridge.on('launch', function () {
    NatureApp.showView('welcome');
    ChatBridge.resize(300);
  });
})();
