export function updateStatus(text) {
	var status = document.getElementById('status');

	if(text == '') {
	   document.getElementById('status-container').style.display = 'none';
	} else {
	  document.getElementById('status-container').style.display = 'block';      
	}

	status.innerHTML = text;
}