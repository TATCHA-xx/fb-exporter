var bkg = chrome.extension.getBackgroundPage();
var total_visible_friends = 0;
var friends_remaining_count = 0;

/**
 * Render all my friends below. Display their profile pic and a link to their
 * profile page. As well, when hovered, show their name.
 */
function renderFriendList() {
  $('#step1').hide();
  $('#friendlist').show();
  $('#step2').show();

  // Reset counter of visible friends. This is just used to show how many friends
  // we have, and reused for step 3.
  total_visible_friends = 0;
  
  // The friends list is stored in the background page. Lets get it then render.
  chrome.tabs.sendRequest(bkg.facebook_id,
                          {getFriendsMap: 1}, function(response) {
    $.each(response.data, function(key, value) {
      total_visible_friends++;
      var li = document.createElement('li');
      $(li).addClass('friend-row')
           .attr('id', key)
           .html('<img src="' + value.photo + '" title="' + value.text + '"/>' +
                 '<span>PENDING</span>')
           .click(
             function() {
                chrome.tabs.create({url: 'http://facebook.com' + value.path });
             }
           );
      $('#friendlist').append(li);
    });

    // Check if we have any friends.
    if (total_visible_friends == 0) {
      var li = document.createElement('li');
      $(li).addClass('friend-row')
           .text('Looks like you have no friends? Impossible! You probably need ' +
                 'to pick a different network (see above).');
    }

    // Show friend counter. Reuse this from step 3.
    $('#remaining-friend-count').text(total_visible_friends + ' friends!');
    $('#remaining-friend-count').show();

    // Initialize the remaining count, used for step 3.
    friends_remaining_count = total_visible_friends;
  });
}

/**
 * The main process to start the lengthy process. This will spawn an iframe
 * for every user so we can extract data from it.
 */
function startCrunching() {
  $('#step2').hide();
  $('#step3').show();

  $('#remaining-friend-count').text(friends_remaining_count + ' remaining');

  // Show pending for each element.
  $.each(document.querySelectorAll('#friendlist li span'), function(key, value) {
    $(value).show();
  });
  
  // Start request, let the background page start the long long long process!
  chrome.tabs.sendRequest(bkg.facebook_id,
                          {startExportFriendData: 1});
}

/**
 * Friend information recieved that needs to be processed/
 * @param {object} friend An object that represents a single friend. Keys are:
 *                        - id: The unique id of the facebook user.
 *                        - name: The full name.
 *                        - email: A list of email addresses.
 *                        - aims: A list of AIM instant messengers.
 *                        - websites: A list of websites.
 *                        - fb: The unique facebook URL for the user.
 *                        - gtalks: Google Talk address.
 */
function gotInfoForFriend(friend) {
  console.log(friend.name);
  var item = $('#' + friend.id);
  item.find('span').text('PROCESSED');
  item.addClass('processed');
  
  var checkbox = document.createElement('input');
  $(checkbox).attr('type', 'checkbox')
             .attr('checked', '1')
             .attr('id', 'checkbox' + friend.id)
             .addClass('checkbox');
  item.prepend($(checkbox));

  // Attach the friend object to the list item, for later retrieval.
  item.data(friend);

  // Create a detailed view, for now disable this until we make a better UI,
  // perhaps a hover (card) that shows the persons extracted information.
  var detail_ul = document.createElement('ul');
  $(detail_ul).addClass('friend-detail');
  // item.append($(detail_ul));

  console.log(friend);
  $.each(friend, function(key, value) {
    if (key == 'name') {
      // No need to show name, since it's part of the parent li.
      return;
    }

    if (value) {
      if ($.isArray(value)) {
        $.each(value, function(k, v) {
          var detail_li = document.createElement('li');
          $(detail_li).text(key + ': ' + v);
          $(detail_ul).append($(detail_li));
        });
      } else {
        var detail_li = document.createElement('li');
        $(detail_li).text(key + ': ' + value);
        $(detail_ul).append($(detail_li));
      }
    }
  });

  friends_remaining_count -= 1;

  $('#remaining-friend-count').text(friends_remaining_count + ' remaining');

  if (friends_remaining_count == 0) {
    // All of the friend info for the visible subset of friends has been
    // received.  Show specific export buttons now.
    $('#step3').hide();
    $('#step4').show();

    // Remove the ajax loading gif.
    $('#export-methods img').remove();

    //chrome.tabs.sendRequest(bkg.facebook_id,
    //                        {hideTopBanner: 1});

    $('#remaining-friend-count').hide();
  }
}

/**
 * Setup a list of the visible, checked friends that we want to send to 
 * export.
 */
function setupAndStartExport(request) {
  // Only get the checked friends, disregard all others.
  var requested_friends = $('li.friend-row').map( function(idx, e) {
    // First, see if this element's checkbox is checked or not.
    if ($('.checkbox', e).attr('checked') != '1') {
      return null;
    }
    return $(e).data();
  }).get();

  // Reset the remaining friends counter, to take into effect the checked friends.
  friends_remaining_count = requested_friends.length;
  if (friends_remaining_count != 0) {
    $('#remaining-friend-count').show().text(
        friends_remaining_count + ' remaining');
  } else {
    // Remove the ajax loading gif, if there are no friends_remaining_count.
    alert('You don\'t have any friends selected!');
    $('#export-methods img').remove();
  }

  // Send a request to the background page, so that we can start the export
  // module process.
  request.requestedFriends = requested_friends;
  chrome.extension.sendRequest(request);
}

$(document).ready(function() {
  // Activate the Terms of Service. They must click it to continue.
  $('#tos').click( function() {
    if ($('#tos').attr('checked')) {
      $('.tos-guarded').attr('disabled', false);
    } else {
      $('.tos-guarded').attr('disabled', true);
    }
  });

  chrome.extension.onRequest.addListener(
    function(request, sender, sendResponse) {
      if (request.gotInfoForFriend) {
        gotInfoForFriend(request.gotInfoForFriend);
        sendResponse({OK: 1});
      }
      if (request.csvExportFinished) {
        var csv_popup = $("<div/>");
        $(csv_popup).attr("id", "csv-popup");

        var textarea = $("<textarea/>");
        $(textarea).text(request.csvExportFinished);

        var a = $("<a/>").attr("href", "javascript:void(0);")
                         .text("close")
                         .click(function() {
          $("#csv-popup").remove();
        });

        var info = $("<span/>").text("Here is your CSV.  Copy and save it somewhere safe.");

        $(csv_popup).append(info);
        $(csv_popup).append(a);
        $(csv_popup).append(textarea);

        $(document.body).append(csv_popup);
      }
      if (request.finishedProcessingFriend) {
        // The export finished for this contact.  Update the list, based
        // on the success status, or show the error message.
        console.log('finishedProcessingFriend ', request.friend.name);
        console.log('finishedProcessingFriend ', request.success);
        console.log('finishedProcessingFriend ', request.message);

        var item = $('#' + request.friend.id);
        var status_text = request.success ? 'success' : 'failed';
        item.removeClass('processed');
        item.find('span').text(status_text.toUpperCase());
        item.addClass(status_text);
        
        friends_remaining_count -= 1;
        $('#remaining-friend-count').show().text(
            friends_remaining_count + ' remaining');

        if (friends_remaining_count == 0) {
          // Remove the ajax loading gif.
          $('#export-methods img').remove();

          //chrome.tabs.sendRequest(bkg.facebook_id,
          //                        {hideTopBanner: 1});
        }
      }
    });

  $('.continue1').click(renderFriendList);

  $('#start-crunching').click(startCrunching);

  // Gmail exportation:
  $('#export-to-gmail').click(function() {
    $('#export-to-gmail').parent().prepend(
          $('#ajax-loader').clone().attr('id', '').show());

    setupAndStartExport({doGmailExport: 1});
  });

  // CSV exportation:
  $('#export-to-csv').click(function() {
    $('#export-to-csv').parent().prepend(
          $('#ajax-loader').clone().attr('id', '').show());

    setupAndStartExport({doCSVExport: 1});
  });
});