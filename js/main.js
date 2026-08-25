(function () {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var reveals = document.querySelectorAll('.reveal');

  if (reduceMotion || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    reveals.forEach(function (el) { io.observe(el); });
  }

  document.querySelectorAll('[data-contact-form]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var endpoint = form.getAttribute('data-form-endpoint');
      var status = form.querySelector('[data-form-status]');
      var button = form.querySelector('button[type="submit"]');
      var name = form.elements.name.value.trim();
      var email = form.elements.email.value.trim();
      var message = form.elements.message.value.trim();
      var honey = form.elements._honey ? form.elements._honey.value.trim() : '';

      if (honey) {
        form.reset();
        return;
      }

      if (status) status.textContent = 'Sending. Very official. Lots of packets.';
      if (button) button.disabled = true;

      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          name: name,
          email: email,
          _replyto: email,
          message: message,
          _subject: 'Zero to One message from ' + name,
          _template: 'table',
          _captcha: 'false'
        })
      })
        .then(function (response) {
          if (!response.ok) throw new Error('Unable to submit form.');
          return response.json();
        })
        .then(function () {
          form.reset();
          if (status) status.textContent = 'Sent. We have it, assuming the internet behaved for once.';
        })
        .catch(function () {
          if (status) status.textContent = 'That did not send. The form has one job and somehow failed it.';
        })
        .finally(function () {
          if (button) button.disabled = false;
        });
    });
  });
})();
