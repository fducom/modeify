var colorParser = require('color-parser');
var convert = require('convert');
var d3 = require('d3');
var domify = require('domify');
var hogan = require('hogan.js');
var luminosity = require('luminosity');
var session = require('session');
var toSentenceCase = require('to-sentence-case');
var view = require('view');

/**
 * Expose `View`
 */

var View = module.exports = view(require('./template.html'), function(view,
  model) {
  d3.select(view.el)
    .on('mouseover', function() {
      window.transitive.focusJourney(model.id());
    });
});

/**
 * Detail template
 */

var detail = hogan.compile(require('./detail.html'));

/**
 * Details, details
 */

View.prototype.segments = function() {
  var segments = this.model.segments();
  var details = '';

  // Add a detail
  function addDetail(d) {
    details += detail.render(d);
  }

  // Add transit segments
  var length = segments.length;
  for (var i = 0; i < length; i++) {
    var segment = segments[i];

    // Check for a walking distance
    if (segment.walkTime !== 0) {
      addDetail({
        description: 'Walk ' + Math.round(segment.walkTime / 60) + ' mins',
        type: 'walk',
        iconSegment: true
      });

      addDetail({
        description: segment.fromName,
        type: 'transfer',
        transfer: true
      });
    }

    var color = segment.type === 'train' ? segment.routeShortName.toLowerCase() :
      'gray';

    addDetail({
      description: 'Take <strong>' + segment.routeShortName + '</strong>',
      color: color,
      time: Math.round(segment.rideStats.avg / 60),
      type: segment.type,
      segment: true
    });

    addDetail({
      description: segment.toName,
      type: 'transfer',
      transfer: true
    });
  }

  if (segments.length === 0) {
    // One mode the entire way
    switch (this.model.mode()) {
      case 'bicycle':
        details += this.narrativeDirections('bike', 'Bike');
        break;
      case 'car':
        details += this.narrativeDirections('car', 'Drive');
        break;
      case 'walk':
        details += this.narrativeDirections('walk', 'Walk');
        break;
    }
  } else {
    // Final Walk Segment
    addDetail({
      description: 'Walk ' + (this.model.finalWalkTime() / 60 | 0) +
        ' mins',
      type: 'walk',
      iconSegment: true
    });
  }

  return details;
};

/**
 * Get a narrative description
 */

function ndescription(a, dir, dis, st) {
  return a + ' ' + dir + ' on ' + st + ' for ' + convert.metersToMiles(dis) +
    ' mile(s)';
}

/**
 * Add narrative directions
 */

View.prototype.narrativeDirections = function(type, action) {
  var steps = this.model.walkSteps();

  // Add initial narrative step
  var narrative = detail.render({
    description: ndescription(action, steps[0].absoluteDirection.toLowerCase(),
      steps[0].distance, steps[0].streetName),
    iconSegment: true,
    type: type
  });

  var iconDirection = 'east';
  for (var i = 1; i < steps.length; i++) {
    switch (steps[i].relativeDirection) {
      case 'RIGHT':
        iconDirection = 'east';
        break;
      case 'LEFT':
        iconDirection = 'west';
        break;
      case 'CONTINUE':
        iconDirection = 'north';
        break;
      case 'SLIGHTLY_RIGHT':
        iconDirection = 'northeast';
        break;
      case 'SLIGHTLY_LEFT':
        iconDirection = 'northwest';
        break;
    }

    narrative += detail.render({
      description: toSentenceCase(steps[i].relativeDirection) + ' on ' +
        steps[i].streetName + ' for ' + convert.metersToMiles(steps[i].distance) +
        ' mile(s)',
      direction: iconDirection
    });
  }

  return narrative;
};

/**
 * Average trip length in minutes
 */

View.prototype.average = function() {
  return Math.round(this.model.time());
};

/**
 * Has cost
 */

View.prototype.hasCost = function() {
  return this.model.totalCost() > 0;
};

/**
 * Fare
 */

View.prototype.fare = function() {
  switch (this.model.mode()) {
    case 'bicycle':
    case 'walk':
      return (this.model.calories() * 250 / 1000).toFixed(0) + 'k cals';
    default:
      var yearlyTotal = this.model.totalCost() * 250;
      if (yearlyTotal > 1000) yearlyTotal = (yearlyTotal / 1000).toFixed(2) +
        'k';
      else yearlyTotal = yearlyTotal.toFixed(0);
      return '$' + yearlyTotal;
  }
};

/**
 * Calories
 */

View.prototype.calories = function() {
  var total = this.model.calories() * 250;
  return total > 1000
    ? (total / 1000).toFixed(0) + 'k'
    : total.toFixed(0);
};

/**
 * Distance
 */

View.prototype.distance = function() {
  return convert.milesToString(this.model.totalDistance());
};

/**
 * To/from
 */

View.prototype.from = function() {
  return session.plan().from().split(',')[0];
};
View.prototype.to = function() {
  return session.plan().to().split(',')[0];
};

/**
 * Show/hide
 */

View.prototype.showHide = function() {
  this.el.classList.toggle('expanded');
};

/**
 * Simple Template
 */

var simpleTemplate = hogan.compile(require('./simple.html'));

/**
 * Simple Segments
 */

View.prototype.simpleSegments = function() {
  var html = '';
  var segments = this.model.segments();

  segments.forEach(function(segment) {
    var rgb = [ 192, 192, 192 ];
    if (segment.color) {
      rgb = colorParser(segment.color);
      rgb = [rgb.r, rgb.g, rgb.b];
    } else {
      segment.color = 'gray';
    }

    html += simpleTemplate.render({
      color: segment.color,
      light: luminosity.light(rgb) ? 'light' : 'dark',
      mode: modeToIcon(segment.mode),
      name: segment.shield
    });
  });

  if (segments.length === 0) {
    html += simpleTemplate.render({
      color: 'transparent',
      mode: modeToIcon(this.model.mode()),
      name: ' '
    });
  }

  return html;
};

/**
 * Has what?
 */

View.prototype.hasCar = function() { return this.model.mode() === 'car'; };
View.prototype.hasTransit = function() { return this.model.mode() === 'subway' || this.model.mode() === 'bus'; };
View.prototype.hasBiking = function() { return this.model.mode() === 'bicycle'; };
View.prototype.hasWalking = function() {
  switch (this.model.mode()) {
    case 'bicycle':
    case 'car':
      return false;
    default:
      return true;
  }
};

function modeToIcon(m) {
  m = m.toLowerCase();
  switch (m) {
    case 'bicycle':
      return 'bike';
    case 'pedestrian':
      return 'walk';
    case 'subway':
      return 'train';
    default:
      return m;
  }
}

/*
  watts = speed * (k1 + k2 * speed * speed)

  Where:

  W = power in watts
    1 W = 1 joule/sec
    69.78W = 1000 calories/min = 1 kilocal/min = 1 Calorie/min
    1 Calorie = 4186 joules
  Cv = speed of cyclist in meters/sec
    1 mph = .447 meters/sec
    1 mph = 1.609 kilometeres/hr
  K1 3.509
  K2 0.2581

  reference: http://www.cptips.com/formula.htm
*/

function caloriesBurnedBiking(speed, minutes) {
  var k1 = 3.509;
  var k2 = 0.2581;
  var watts = speed * (k1 + k2 * speed * speed);
  var kcaloriesPerMin = watts / 69.78;
  return kcaloriesPerMin * minutes;
}

/**
 * Find MET scores here: http://appliedresearch.cancer.gov/atus-met/met.php
 *
 * Cycling: 8.0
 * Walking: 3.8
 */

function bikeCal(kg, hours) { return caloriesBurned(8.0, kg, hours); }
function walkCal(kg, hours) { return caloriesBurned(3.8, kg, hours); }
function caloriesBurned(met, kg, hours) {
  return met * kg * hours;
}
