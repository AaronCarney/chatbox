# Nature Explorer Development Quick Start

## Files to Create

```
src/renderer/public/apps/nature-explorer/
├── index.html              # Main iframe page
├── bridge.js               # Tool invocation handler (postMessage with ChatBridge)
├── styles.css              # UI styling
├── components/
│   ├── SpeciesProfile.js   # Individual species card with images, taxonomy
│   ├── ComparisonTable.js  # Side-by-side species comparison
│   └── HabitatGrid.js      # Grid of species for a habitat
└── api/
    ├── inaturalist.js      # iNaturalist API client
    └── perenual.js         # Perenual API client
```

## Bridge.js Structure (Mimic Chess/Go)

```javascript
(function() {
  // Global state
  var currentProfile = null;
  var currentHabitat = null;

  // Tool handlers
  ChatBridge.on('toolInvoke', function(payload, requestId) {
    switch (payload.name) {
      case 'search_species':
        handleSearchSpecies(payload.arguments, requestId);
        break;
      case 'get_species_details':
        handleGetSpeciesDetails(payload.arguments, requestId);
        break;
      case 'explore_habitat':
        handleExploreHabitat(payload.arguments, requestId);
        break;
      case 'get_random_species':
        handleGetRandomSpecies(payload.arguments, requestId);
        break;
      case 'compare_species':
        handleCompareSpecies(payload.arguments, requestId);
        break;
      default:
        ChatBridge.respondToTool(requestId, { error: 'Unknown tool: ' + payload.name });
    }
  });

  function handleSearchSpecies(args, requestId) {
    var query = args.query;
    var type = args.type || 'all';
    var region = args.region || 'worldwide';

    INaturalist.searchTaxa(query, type, region, function(err, results) {
      if (err) {
        ChatBridge.respondToTool(requestId, { error: err.message });
        return;
      }
      
      // Return search results (array of basic species info)
      ChatBridge.respondToTool(requestId, {
        results: results.map(function(r) {
          return {
            id: r.id,
            common_name: r.preferred_common_name || r.name,
            scientific_name: r.name,
            type: r.rank === 'species' && r.taxonomy ? getType(r.taxonomy) : 'unknown',
            image_url: r.default_photo ? r.default_photo.medium_url : null,
            habitat: r.preferred_common_name || 'Unknown',
            iucn_status: r.conservation_status || 'DD',
          };
        }),
        total: results.length,
      });
    });
  }

  function handleGetSpeciesDetails(args, requestId) {
    var speciesId = args.species_id;
    var includeImages = args.include_images !== false;
    var includeSimilar = args.include_similar !== false;

    // Determine API source (inaturalist: vs perenual:)
    var source = speciesId.split(':')[0];
    var id = speciesId.split(':')[1];

    if (source === 'inaturalist') {
      INaturalist.getTaxonDetails(id, function(err, data) {
        if (err) {
          ChatBridge.respondToTool(requestId, { error: err.message });
          return;
        }
        currentProfile = buildProfileResponse(data, includeImages, includeSimilar);
        renderSpeciesProfile(currentProfile);
        ChatBridge.respondToTool(requestId, currentProfile);
        ChatBridge.sendState(currentProfile);
      });
    } else if (source === 'perenual') {
      Perenual.getPlantDetails(id, function(err, data) {
        if (err) {
          ChatBridge.respondToTool(requestId, { error: err.message });
          return;
        }
        currentProfile = buildPlantResponse(data);
        renderSpeciesProfile(currentProfile);
        ChatBridge.respondToTool(requestId, currentProfile);
        ChatBridge.sendState(currentProfile);
      });
    }
  }

  function handleExploreHabitat(args, requestId) {
    var habitat = args.habitat;
    var region = args.region || 'worldwide';
    var type = args.type || 'all';
    var limit = args.limit || 12;

    INaturalist.getHabitatSpecies(habitat, region, type, limit, function(err, results) {
      if (err) {
        ChatBridge.respondToTool(requestId, { error: err.message });
        return;
      }
      
      currentHabitat = {
        habitat: habitat,
        region: region,
        species: results,
      };
      
      renderHabitatGrid(currentHabitat);
      ChatBridge.respondToTool(requestId, currentHabitat);
      ChatBridge.sendState(currentHabitat);
    });
  }

  function handleGetRandomSpecies(args, requestId) {
    var type = args.type || 'all';
    var difficulty = args.difficulty || 'any';
    var region = args.region || 'worldwide';

    INaturalist.getRandomSpecies(type, difficulty, region, function(err, data) {
      if (err) {
        ChatBridge.respondToTool(requestId, { error: err.message });
        return;
      }
      
      currentProfile = buildProfileResponse(data, true, true);
      renderSpeciesProfile(currentProfile);
      ChatBridge.respondToTool(requestId, currentProfile);
      ChatBridge.sendState(currentProfile);
    });
  }

  function handleCompareSpecies(args, requestId) {
    var speciesIds = args.species_ids;
    var aspects = args.aspects || ['taxonomy', 'habitat', 'diet', 'behavior', 'size', 'lifespan', 'conservation', 'adaptations'];

    var remaining = speciesIds.length;
    var species = [];
    var errors = [];

    speciesIds.forEach(function(speciesId, idx) {
      var source = speciesId.split(':')[0];
      var id = speciesId.split(':')[1];

      var callback = function(err, data) {
        remaining--;
        if (err) {
          errors.push(speciesId + ': ' + err.message);
        } else {
          species[idx] = data;
        }
        
        if (remaining === 0) {
          if (errors.length > 0) {
            ChatBridge.respondToTool(requestId, { error: errors.join('; ') });
            return;
          }
          
          var comparison = buildComparisonResponse(species, aspects);
          renderComparisonTable(comparison);
          ChatBridge.respondToTool(requestId, comparison);
          ChatBridge.sendState(comparison);
        }
      };

      if (source === 'inaturalist') {
        INaturalist.getTaxonDetails(id, callback);
      } else if (source === 'perenual') {
        Perenual.getPlantDetails(id, callback);
      }
    });
  }

  // Render functions (update DOM safely)
  function renderSpeciesProfile(profile) {
    var container = document.getElementById('profile-container');
    container.textContent = '';
    
    // Build species card with images, taxonomy, facts
    var card = document.createElement('div');
    card.className = 'species-profile';
    
    // Safely add title
    var title = document.createElement('h2');
    title.textContent = profile.common_name + ' (' + profile.scientific_name + ')';
    card.appendChild(title);
    
    // Safely add images (validate src)
    if (profile.images && profile.images.length > 0) {
      var img = document.createElement('img');
      img.src = profile.images[0].url;
      img.alt = profile.common_name;
      card.appendChild(img);
    }
    
    // Safely add description and facts
    var desc = document.createElement('p');
    desc.textContent = profile.description;
    card.appendChild(desc);
    
    container.appendChild(card);
    ChatBridge.resize(600);
  }

  function renderHabitatGrid(habitat) {
    var container = document.getElementById('habitat-container');
    container.textContent = '';
    
    // Build grid of species cards
    habitat.species.forEach(function(sp) {
      var tile = document.createElement('div');
      tile.className = 'habitat-tile';
      
      var img = document.createElement('img');
      img.src = sp.image_url;
      img.alt = sp.common_name;
      tile.appendChild(img);
      
      var name = document.createElement('h4');
      name.textContent = sp.common_name;
      tile.appendChild(name);
      
      var desc = document.createElement('p');
      desc.textContent = sp.brief_description;
      tile.appendChild(desc);
      
      container.appendChild(tile);
    });
    
    ChatBridge.resize(800);
  }

  function renderComparisonTable(comparison) {
    var container = document.getElementById('comparison-container');
    container.textContent = '';
    
    // Build table with species as columns, aspects as rows
    var table = document.createElement('table');
    table.className = 'comparison-table';
    
    // Header row: species names
    var thead = document.createElement('thead');
    var headerRow = document.createElement('tr');
    
    var aspectHeader = document.createElement('th');
    aspectHeader.textContent = 'Aspect';
    headerRow.appendChild(aspectHeader);
    
    comparison.comparison.forEach(function(sp) {
      var th = document.createElement('th');
      th.textContent = sp.common_name;
      headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Body: aspect rows
    var tbody = document.createElement('tbody');
    var aspects = ['taxonomy', 'habitat', 'diet', 'behavior', 'size', 'lifespan', 'conservation'];
    
    aspects.forEach(function(aspect) {
      var row = document.createElement('tr');
      
      var aspectCell = document.createElement('td');
      aspectCell.textContent = aspect;
      row.appendChild(aspectCell);
      
      comparison.comparison.forEach(function(sp) {
        var cell = document.createElement('td');
        cell.textContent = sp[aspect] || 'N/A';
        row.appendChild(cell);
      });
      
      tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    container.appendChild(table);
    ChatBridge.resize(1000);
  }

  // State sync
  ChatBridge.onStateRequest(function() {
    return currentProfile || currentHabitat || { view: 'empty' };
  });

  // Initialization
  ChatBridge.on('launch', function(config) {
    var container = document.getElementById('content');
    container.textContent = 'Nature Explorer loaded. Search for a species to get started.';
  });
})();
```

## API Client Structure (inaturalist.js)

```javascript
var INaturalist = (function() {
  var BASE_URL = 'https://api.inaturalist.org/v1';

  function searchTaxa(query, type, region, callback) {
    // GET /taxa/autocomplete?q=monarch&rank=species
    var url = BASE_URL + '/taxa/autocomplete?q=' + encodeURIComponent(query);
    
    fetch(url)
      .then(function(res) { return res.json(); })
      .then(function(data) {
        // Filter by type if specified
        var results = data.results || [];
        if (type !== 'all') {
          results = results.filter(function(r) {
            return matchesType(r, type);
          });
        }
        callback(null, results);
      })
      .catch(function(err) { callback(err); });
  }

  function getTaxonDetails(taxonId, callback) {
    // GET /taxa/{id}
    var url = BASE_URL + '/taxa/' + taxonId;
    
    fetch(url)
      .then(function(res) { return res.json(); })
      .then(function(data) {
        var taxon = data.results[0];
        callback(null, {
          id: 'inaturalist:' + taxon.id,
          common_name: taxon.preferred_common_name || taxon.name,
          scientific_name: taxon.name,
          taxonomy: {
            kingdom: taxon.ancestry ? taxon.ancestry.split('/')[0] : 'Unknown',
            phylum: getTaxonRank(taxon, 'Phylum'),
            class: getTaxonRank(taxon, 'Class'),
            order: getTaxonRank(taxon, 'Order'),
            family: getTaxonRank(taxon, 'Family'),
            genus: getTaxonRank(taxon, 'Genus'),
            species: taxon.name,
          },
          description: taxon.wikipedia_summary || 'No description available.',
          habitat: 'See observations',
          diet: 'See description',
          behavior: 'See description',
          fun_facts: extractFunFacts(taxon),
          iucn_status: taxon.conservation_status || 'DD',
          images: (taxon.photos || []).map(function(p) {
            return { url: p.medium_url, credit: p.attribution };
          }),
          similar_species: [],
        });
      })
      .catch(function(err) { callback(err); });
  }

  function getHabitatSpecies(habitat, region, type, limit, callback) {
    // Implement place-based lookup, then species observations
    // GET /observations?place_id=1234&limit=50
    // This is simplified; production would use comprehensive place mapping
    
    var observations = [];
    // ... fetch observations for habitat + region ...
    
    callback(null, observations);
  }

  function getRandomSpecies(type, difficulty, region, callback) {
    // Query for a random species based on difficulty + type
    // Implementation: fetch top observed species, shuffle, pick one
    
    callback(null, /* taxon data */);
  }

  return {
    searchTaxa: searchTaxa,
    getTaxonDetails: getTaxonDetails,
    getHabitatSpecies: getHabitatSpecies,
    getRandomSpecies: getRandomSpecies,
  };
})();
```

## Index.html Structure

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Nature Explorer</title>
  <link rel="stylesheet" href="styles.css">
  <script src="../../../vendor/chatbridge.js"></script>
  <script src="api/inaturalist.js"></script>
  <script src="api/perenual.js"></script>
  <script src="bridge.js"></script>
</head>
<body>
  <div id="content">
    <h1>Nature Explorer</h1>
    <p>Discover species from around the world. Ask your AI assistant to search for animals, plants, habitats, or comparisons!</p>
  </div>

  <div id="profile-container"></div>
  <div id="habitat-container"></div>
  <div id="comparison-container"></div>

  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      padding: 20px;
      background: #f5f5f5;
    }
    .species-profile {
      background: white;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .species-profile img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 10px 0;
    }
    .habitat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 15px;
    }
    .habitat-tile {
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      cursor: pointer;
      transition: transform 0.2s;
    }
    .habitat-tile:hover {
      transform: translateY(-4px);
    }
    .comparison-table {
      width: 100%;
      border-collapse: collapse;
      background: white;
    }
    .comparison-table th, .comparison-table td {
      border: 1px solid #ddd;
      padding: 12px;
      text-align: left;
    }
  </style>
</body>
</html>
```

## Prompting the Chatbot

Add this to the system prompt so the chatbot knows to use Nature Explorer tools:

```
When a student asks about animals, plants, species, habitats, ecosystems, or biodiversity:

1. ALWAYS use the Nature Explorer tools (search_species, get_species_details, explore_habitat, 
   compare_species, get_random_species). Never answer from memory alone.

2. Search first: Use search_species to find matches.

3. Get details: Call get_species_details to load rich profiles with images, taxonomy, and facts.
   Discuss what the student sees in the iframe.

4. Encourage exploration:
   - If they ask "what's the difference between X and Y?" → use compare_species
   - If they ask "what animals live in [habitat]?" → use explore_habitat
   - If they want discovery → use get_random_species

5. Guide learning: Explain the science, ask follow-up questions, make connections to their life.

6. No task completion: Nature Explorer has no "end state". Students browse until they're done.
   Never call task.completed.

Examples:
- "Tell me about monarch butterflies" → search_species("monarch") → get_species_details() 
  → "Look at those wings! The orange and black are a warning..."
- "What's in the Amazon?" → explore_habitat(habitat="rainforest", region="South America")
  → "Notice how many species live together. That's because..."
- "Compare frogs and toads" → compare_species([frog_id, toad_id])
  → "Frogs are built for water and jumping, toads for land and walking..."
```

## Testing

```bash
# Start the dev server
npm run dev

# Open http://localhost:3000 (or your dev URL)
# Go to a chat window
# Type: "Tell me about monarch butterflies"
# The chatbot should:
#   1. Call search_species("monarch butterfly")
#   2. Call get_species_details("inaturalist:xxxx")
#   3. Iframe shows rich profile
#   4. Chatbot narrates what you see

# Test other tools:
# - "What animals live in coral reefs?" → explore_habitat
# - "Compare lions and tigers" → compare_species
# - "Show me something random" → get_random_species
```

## Content Safety Checklist

- [ ] Filter iNaturalist images: exclude adult/mating content
- [ ] Filter Perenual images: exclude graphics
- [ ] Test with 5 K-12 queries: "cute animals", "bugs", "plants", "ocean", "dinosaurs"
- [ ] Verify no violence/gore in image results
- [ ] Verify descriptions are age-appropriate
- [ ] COPPA compliance: no student data persistence

## Deployment Checklist

- [ ] Add Nature Explorer to seed.ts
- [ ] Test all 5 tools with sample queries
- [ ] Verify iframe sandbox permissions (images, postMessage, localStorage)
- [ ] Test on slow network (API timeouts)
- [ ] Test on mobile (responsive UI)
- [ ] Write user-facing documentation
- [ ] Demo with sample student conversations
