// Copyright Takamitsu Endo (ryukau@gmail.com)
// SPDX-License-Identifier: Apache-2.0

function pageTitle(parent) {
  var title = document.createElement("h1");
  parent.appendChild(title);

  var link = document.createElement("a");
  link.href = "../../index.html";
  title.appendChild(link);

  var img = document.createElement("img");
  img.src = "../../style/favicon/favicon.svg";
  img.alt = "Logo image.";
  img.title = "Go back to index page."
  img.style.height = "2rem";
  img.style.verticalAlign = "middle";
  img.style.marginRight = "0.25em";
  link.appendChild(img);

  var linkText = document.createElement("span");
  linkText.textContent = "Index";
  linkText.style.marginRight = "0.25em";
  link.appendChild(linkText);

  var separator = document.createElement("span");
  separator.textContent = "/";
  separator.style.marginRight = "0.25em";
  title.appendChild(separator);

  var pageName = document.createElement("span");
  pageName.textContent = document.title;
  title.appendChild(pageName);
}
