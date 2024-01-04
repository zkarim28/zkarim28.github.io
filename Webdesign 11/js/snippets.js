function readMore(text) {
    let dots = document.querySelector(`.item[data-text="${text}"] .dots`);
    let moreText = document.querySelector(`.item[data-text="${text}"] .more`); 
    let btnText = document.querySelector(`.item[data-text="${text}"] .plus`);

    console.log(dots);

  if (dots.style.display === "none") {
    dots.style.display = "inline";
    btnText.innerHTML = '<i class="bi bi-plus-lg"></i>';
    moreText.style.display = "none";
  } else {
    dots.style.display = "none";
    btnText.innerHTML = '<i class="bi bi-dash"></i>';
    moreText.style.display = "inline";
  }
}

