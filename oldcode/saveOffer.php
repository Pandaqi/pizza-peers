<?php require_once('ledatabanko.php'); ?>

<?php

// grab offer value
$offer = $_GET['offerSignal'];
$room = $_GET['room'];

// save it in the database
$conn->query("UPDATE `games` SET `offer`='$offer' WHERE `room`='$room' ")



$total_rows = 1;

// while the room code we found already exists ...
while($total_rows > 0) {
	// determine a new room code
	$result = '';
	$characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	$charactersLength = count($characters);
	$idLength = 4;
	for ($i = 0; $i < $idLength; $i++) {
	  $result .= $characters[rand(0, strlen($characters)-1)];
	}

	// check if it exists
	$checkQuery = $conn->query("SELECT COUNT(*) FROM `games` WHERE `room` = '$result' ");
	$total_rows = mysqli_fetch_array($checkQuery)[0];
	echo $conn->error;
}

// if not, create new entry in database
$conn->query("INSERT INTO `games` (room) VALUES ('$result')");
echo $conn->error;

// now return to the lobby
$url = 'lobby.php?type=newPage#init'; 
header( "Location: $url" );

?>